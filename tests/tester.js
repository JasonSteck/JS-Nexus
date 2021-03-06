// Custom test suite (without webpack) by Jason Steck
(function(){
  // Steal references so spies don't interfere
  const setTimeout = window.setTimeout;
  const clearTimeout = window.clearTimeout;
  const consoleLog = console.log.bind(console);
  const consoleWarn = console.warn.bind(console);

  const PASS = 1;
  const FAIL = 0;
  const NO_EXPECTATIONS = null;

  let topContext = {
    descriptionChain: [],
    beforeEachChain: [],
    afterEachChain: [],
    focused: { ref: true },
    its: [],
    fits: [],
    describes: [],
    contexts: [],
    specHelper: Object,
    testTimeout: 5000,
  };

  let currentContext = topContext;
  let currentTest = null;
  let spies = [];

  /* should only be used during parse stage  */

  window.setSpecHelper = (klass) => currentContext.specHelper = klass;

  window.setTestTimeout = (ms) => currentContext.testTimeout = ms;

  window.disableTestTimeout = () => window.setTestTimeout(null);

  window.beforeEach = (func) => {
    currentContext.beforeEachChain.push(func);
  };
  window.afterEach = (func) => {
    currentContext.afterEachChain.unshift(func);
  };

  window.xdescribe = () => {};
  window.describe = (str, func) => {
    currentContext.describes.push([str, func, false]);
  };
  window.fdescribe = (str, func) => {
    currentContext.focused.ref = false;
    currentContext.describes.push([str, func, true]);
  }

  window.xwhen = () => {};
  window.when = (str, func) => {
    currentContext.describes.push(['when '+str, func, false]);
  };
  window.fwhen = (str, func) => {
    currentContext.focused.ref = false;
    currentContext.describes.push(['when '+str, func, true]);
  }

  window.xit = () => {};
  window.it = (name, func) => {
    if(typeof func !== 'function') throw new Error(`Missing function in 'it' block of "${name}"`);
    currentContext.its.push({ name, func });
  };
  window.fit = (name, func) => {
    currentContext.focused.ref = false;
    if(typeof func !== 'function') throw new Error(`Missing function in 'fit' block of "${name}"`);
    currentContext.fits.push({ name, func });
  };

  let testFrameworkDone;
  window.onDoneTesting = new Promise(resolve => testFrameworkDone=resolve);

  let testsShouldStop = false;
  window.stopTests = () => testsShouldStop = true;


  /*  during tests  */
  let runningTests = false;
  let pauseOnErrors = false;

  function Test(currentContext, testDefinition) {
    this.objContext = new currentContext.specHelper; // new object context for each test
    this.context = currentContext;
    this.definition = testDefinition;
    this.result = new TestResultClass(testDefinition);
  }
  Test.prototype.passExpectation = function() {
    this.result.passExpectation();
  }
  Test.prototype.fail = function (msg, error = new Error) {
    const errorStack = getStackStartingAtErrorLocation(error);
    this.result.failExpectation(msg, errorStack);
    if(pauseOnErrors){
      consoleFailMessage(failMessage(this.result));
      debugger;
    }
  }

  function ResultsClass(onAllDone) {
    this.all = [];
    this.failed = [];
    this.noExpectations = [];
    this.doneCount = 0;
    this.doneStarting = false;
    this.onAllDone = onAllDone;
  }
  ResultsClass.prototype.finishIfDone = function() {
    if(this.doneStarting && this.doneCount >= this.all.length) {
      this.onAllDone && this.onAllDone();
    }
  };
  ResultsClass.prototype.trackResult = function (testResult){
    this.all.push(testResult);
    testResult.doneCallback(()=>this.recordResult(testResult))
  };
  ResultsClass.prototype.recordResult = function (testResult){
    if(testResult.result === FAIL) {
      this.failed.push(testResult);
    } else if(testResult.result === NO_EXPECTATIONS) {
      this.noExpectations.push(testResult);
    }
    this.doneCount++;
    this.finishIfDone();
  };
  ResultsClass.prototype.doneStartingTests = function() {
    this.doneStarting = true;
    this.finishIfDone();
  };

  function TestResultClass(test) {
    this.test = test;
    this.result = NO_EXPECTATIONS;
    this.failReasons = [];
    this.callbacks = [];
    this.testPath = currentContext.descriptionChain.slice(0);
    this.testPath.push(test.name);
  }
  TestResultClass.prototype.doneCallback = function(func) {
    if(this.result !== NO_EXPECTATIONS) {
      func(this.result, this.failReasons);
    } else {
      this.callbacks.push(func);
    }
  };
  TestResultClass.prototype.done = function() {
    this.callbacks.forEach(c=>c(this.result, this.failReasons));
  };
  TestResultClass.prototype.failExpectation = function(...reasons) {
    this.result = FAIL;
    this.failReasons.push(reasons.join('\n'));
  };
  TestResultClass.prototype.passExpectation = function() {
    if(this.result === NO_EXPECTATIONS) {
      this.result = PASS;
    }
  };
  TestResultClass.prototype.didPass = function() {
    return this.result === PASS
  };

  let results = null;

  function getFileNameFromErrorLine(line) {
    const res = line.match(/(file:.*):\d+:\d+/);
    return res && res[1] || '<anonymous>';
  }

  let testFramworkFile = getFileNameFromErrorLine((new Error).stack.split('\n')[1]);

  function getErrorLocation(error = new Error) {
    const errorLines = error.stack && error.stack.split('\n') || [];
    for(let i=1;i<errorLines.length;i++) {
      let file = getFileNameFromErrorLine(errorLines[i]);
      if(file !== testFramworkFile) {
        return errorLines[i];
      }
    }

    return errorLines.slice(5,6).join('\n'); //fallback
  }

  function getStackStartingAtErrorLocation(error = new Error) {
    const errorLines = error.stack && error.stack.split('\n') || [];
    let result = [];
    for(let i=1;i<errorLines.length;i++) {
      let file = getFileNameFromErrorLine(errorLines[i]);
      if(file !== testFramworkFile) {
        result.push(errorLines[i]);
      }
    }
    return result.join('\n');
  }

  function isEqual(a,b) {
    if(typeof a !== typeof b) return false;
    if(a === Object(a)){
      return objectsEqual(a,b);
    } else if(Array.isArray(a)) {
      return arraysEqual(a,b)
    } else {
      return a == b;
    }
  }

  function objectsEqual(a, b) {
    let aProps = Object.getOwnPropertyNames(a);
    let bProps = Object.getOwnPropertyNames(b);

    if (aProps.length !== bProps.length) return false;

    for (let i = 0; i < aProps.length; i++) {
      let propName = aProps[i];

      if (!isEqual(a[propName], b[propName])) {
        return false;
      }
    }
    return true;
  }

  function arraysEqual(a, b) {
    if (a === b) return true;
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function getOutputFormat(exp) {
    if(typeof exp === 'function') {
      return exp.toString();
    }
    return JSON.stringify(exp);
  }

  function toEqual(actual, expected, not) {
    if(isEqual(actual,expected) ^ not){
      currentTest.passExpectation();
    } else {
      let a = getOutputFormat(actual);
      let b = getOutputFormat(expected);
      currentTest.fail(`Expected: ${a}\nto equal: ${b}`);
    }
  }

  function toExist(actual, not) {
    if((actual != null) ^ not) {
      currentTest.passExpectation();
    } else {
      let notStr = not? 'not ' : '';
      currentTest.fail(`Expected: ${actual}\nto ${notStr}exist`);
    }
  }

  function toBe(actual, expected, not) {
    if((actual === expected) ^ not){
      currentTest.passExpectation();
    } else {
      let a = getOutputFormat(actual);
      let b = getOutputFormat(expected);
      currentTest.fail(`Expected: ${a}\n   to be: ${b}`);
    }
  }

  function toThrow(actual, exception, not) {
    let threw = false;
    let correctlyThrew = false;
    let error = null;
    let anyException = exception === undefined;
    try {
      actual();
    } catch (err) {
      error = err;
      if(err == exception ||
        anyException ||
        (err.name !== undefined &&
        err.message!== undefined &&
        err.name === exception.name &&
        isEqual(err.message, exception.message))) {

        correctlyThrew = true;
      }
      threw = true;
    }
    exceptionStr = anyException? 'an error': `"${exception}"`;
    if(not) {
      if(correctlyThrew) {
        currentTest.fail(`Expected ${actual}\nnot to throw ${exceptionStr}\n but it did`);
      } else {
        currentTest.passExpectation();
      }
    } else {
      if(correctlyThrew) {
        currentTest.passExpectation();
      } else if(threw) {
        let notString = not?'not':'';
        currentTest.fail(`Expected: ${actual}\n${notString}to throw: ${exceptionStr}\n but got: "${error}"`);
      } else {
        currentTest.fail(`Expected: ${actual}\nto throw: ${exceptionStr}\n but didn't get anything`);
      }
    }
  }

  function toHaveBeenCalled(actual, not) {
    if(!(actual && typeof actual==='function' && actual._isSpy)) {
      let msg = `Error: cannot expect "${actual && actual.methodName}" toHaveBeenCalled. It is not a spy.`;
      currentTest.fail(msg);
    }

    if((actual.calls.length > 0) ^ not) {
      currentTest.passExpectation();
    } else {
      if(not) {
        currentTest.fail(`Expected: "${actual.methodName}"\nto not have been called, but it was`);
      } else {
        currentTest.fail(`Expected: "${actual.methodName}"\nto have been called, but it wasn't`);
      }
    }
  }

  function toHaveBeenCalledWith(actual, expected, not) {
    if(!(actual && typeof actual==='function' && actual._isSpy)) {
      let msg = `Error: cannot expect "${actual && actual.methodName}" toHaveBeenCalled. It is not a spy.`;
      currentTest.fail(msg);
    }

    let found = false;
    for(let i=0; i<actual.calls.length; i++) {
      let call = actual.calls[i];
      if(call.length === expected.length) {
        found = found || isEqual(call, expected);
      }
    }

    if(found ^ not) {
      currentTest.passExpectation();
    } else {
      if(found) {
        currentTest.fail(`Expected spy "${actual.methodName}" \nto not have been called with:\n  [${expected}]\nbut actual calls were:\n  [${actual.calls.join(']\n[')}]`);
      } else {
        currentTest.fail(`Expected spy "${actual.methodName}" \nto have been called with:\n  [${expected}]\nbut actual calls were:\n  [${actual.calls.join(']\n[')}]`);
      }
    }

  }

  function Expectation(actual) {
    this.actual = actual;
    this.negate = false;
  }
  // allow for `expectation.not.` instead of `expectation.not().`
  Object.defineProperty(Expectation.prototype, 'not', {
    get() {
      this.negate = !this.negate;
      return this;
    }
  })
  Expectation.prototype.toHaveBeenCalledWith = function(...expected) {
     return toHaveBeenCalledWith(this.actual, expected, this.negate);
  }
  Expectation.prototype.toHaveBeenCalled = function() {
    return toHaveBeenCalled(this.actual, this.negate);
  }
  Expectation.prototype.toThrow = function(expected) {
     return toThrow(this.actual, expected, this.negate);
  }
  Expectation.prototype.toEqual = function(expected) {
     return toEqual(this.actual, expected, this.negate);
  }
  Expectation.prototype.toExist = function() {
     return toExist(this.actual, this.negate);
  }
  Expectation.prototype.toBe = function(expected) {
     return toBe(this.actual, expected, this.negate);
  }

  window.expect = (actual) => {
    return new Expectation(actual);
  };

  function ensureSpy(str, obj) {
    if(!(obj && obj[str] && obj[str]._isSpy)) {
      return obj[str] = newSpyGuy(str, obj);
    }
    return obj[str];
  }

  function newSpyGuy(str, obj) {
    function spyGuy(...args){
      self.calls.push(args);
      let returnValue = undefined;
      if(self.callFake) {
        returnValue = self.callFake.apply(this, args);
      }
      if(self.returnValue) {
        returnValue = self.returnValue;
      }
      return returnValue;
    }
    let self = spyGuy;
    spyGuy._isSpy = true;
    spyGuy.calls = [];
    spyGuy.methodName = str;
    spyGuy.object = obj;
    spyGuy.originalFunc = obj && obj[str];
    spyGuy.callFake = null;
    spyGuy.returnValue = null;

    spies.push(spyGuy);
    return spyGuy;
  }

  window.newSpy = name => newSpyGuy(name);

  window.stub = function(obj) {
    return new Proxy({}, {
      get: function(_, str) {
        let spyGuy = ensureSpy(str, obj);
        function spyHandler(){}
        spyHandler.toReturn = val => {
          spyGuy.returnValue = val;
          return spyHandler;
        };
        spyHandler.spy = spyGuy;
        return spyHandler;
      },
      set: function(_, str, val){
        ensureSpy(str, obj);
        if(typeof val === 'function') {
          obj[str].callFake = val;
        }
      },
    });
  };

  function indentLines(lines, pad = '  '){
    let padding = '';
    return lines.map(desc => {
      return [padding+desc, padding+=pad][0];
    })
  }

  function failMessage(testResult, showAllLines) {
    let failReasons = testResult.failReasons;
    if(!showAllLines) {
      failReasons = [failReasons[failReasons.length-1]];
    }
    let descriptions = indentLines(testResult.testPath).join('\n');
    return `${descriptions} \n${failReasons.join('\n')}`;
  }

  function consoleFailMessage(msg) {
    consoleLog('%cFailure:', 'color: red; font-weight: bold;');
    consoleLog(msg);
  }

  async function asyncForEach(arr, func) {
    for(let i = 0; i < arr.length; i++) {
      await func(arr[i]);
    }
  }

  function parseContext(context) {
    let prevContext = currentContext;
    context.describes.forEach(desc => {
      let newContext = {
        descriptionChain: context.descriptionChain.slice(0),
        beforeEachChain: context.beforeEachChain.slice(0),
        afterEachChain: context.afterEachChain.slice(0),
        focused: desc[2]? { ref: true } : prevContext.focused,
        its: [],
        fits: [],
        describes: [],
        contexts: [],
        specHelper: context.specHelper,
        testTimeout: prevContext.testTimeout,
      };
      newContext.descriptionChain.push(desc[0]);
      context.contexts.push(newContext);
      currentContext = newContext;
      desc[1]();
      parseContext(newContext);
    });
    currentContext = prevContext;
  }

  /* ====================== spec execution ====================== */

  async function runContext(context) {
    currentContext = context; // this is, in fact, used elsewhere
    if(currentContext.focused.ref) { // if our context is focused
      await asyncForEach(currentContext.its, runTest);
    } else {
      await asyncForEach(currentContext.fits, runTest);
    }

    await asyncForEach(currentContext.contexts, runContext);
  }

  async function runTest(testDefinition) {
    const test = currentTest = new Test(currentContext, testDefinition);

    results.trackResult(test.result);

    const allBlocks = [
      ...currentContext.beforeEachChain,
      testDefinition.func,
      ...currentContext.afterEachChain,
    ];

    let runningTest = true;

    const timeLimitId = setTimeout(function() {
      if(currentContext.testTimeout != null) {
        runningTest = false;

        test.fail('Test forcefully timed out (consider throwing timeout errors yourself for better error messages)');
      }
    }, currentContext.testTimeout);

    // Possiblity: break this up into three sections (beforeEach/it/afterEach)
    await asyncForEach(allBlocks, async block => {
      if(runningTest) {
        await block.call(test.objContext);
      }
    }).catch(err => { // if any of the blocks fail, jump here
      const msg = err && err.message || err;
      test.fail('Uncaught Exception: ' + msg, err);
    });

    clearTimeout(timeLimitId);
    currentTest = test; // restore just in case
    _postTest(test.objContext);
  }

  function _postTest(objContext) {
    // framework context should already be restored, if needed
    if(currentTest.result.didPass()) {
      consoleLog('Passed: %s', currentTest.result.testPath.join(' '));
    }
    currentTest.result.done();

    spies.forEach(s => {
      if(s.object) {
        s.object[s.methodName] = s.originalFunc;
      } else {
        // This is a detached spy
      }
    });
    spies = [];
  }

  function doneRunningSpecs() {
    runningTests = false;

    let total = results.all.length;
    let totalPlural = total===1? '' : 's';

    if(results.failed.length > 0) {
      results.failed.forEach(result => {
        if(!pauseOnErrors) {
          consoleFailMessage(failMessage(result, true));
        }
      });
      let failCount = results.failed.length;
      consoleLog('\nTests Finished: %d Failure%s / %d Test%s', failCount, failCount===1?'':'s', total, totalPlural);
    } else {
      consoleLog('\nTests Finished: %d Successes%s / %d Test%s', total, totalPlural, total, totalPlural);
    }
    if(results.noExpectations.length > 0) {
      results.noExpectations.forEach(result => {
        consoleWarn('No Expectations in: \n%s', indentLines(result.testPath).join('\n'), result.test.func);
      });
    }

    return results;
  }

  window.runSpecs = (options) => {
    pauseOnErrors = options.pauseOnErrors;
    testsShouldStop = false;
    results = new ResultsClass(doneRunningSpecs);

    // parse specs
    parseContext(topContext);

    // run specs
    runningTests = true;
    runContext(topContext).then(()=>{
      results.doneStartingTests();
      testFrameworkDone(results);
    });
  };
})();
