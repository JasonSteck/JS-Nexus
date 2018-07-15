window.JSNexusUser = window.Nexus = (function() {

// Experiment with morphing the current instance.
const NexusTypes = {
Client: {
  host: null,
  send(message) {
    this._ws.send(message);
  },
  _onServerMessage(json) {
    switch(json.type) {
      case 'CONNECTED':
        this.host = json.host;
        this.joined.resolve(this.host);
        break;
      default:
        this.default._onServerMessage(json);
    }
  }
},

Host: {
  id: null,
  name: null,
  onNewClient: createPromiseEventListener(),
  onMessage: createPromiseEventListener(),
  _onServerMessage(json) {
    switch(json.type) {
      case 'REGISTERED':
        this.id = json.hostID;
        this.name = json.hostName;
        this.hosting.resolve(json);
        break;
      case 'NEW_CLIENT':
        this.onNewClient.trigger(json.clientID, json.request);
        break;
      case 'FROM_CLIENT':
        this.onMessage.trigger(json.message, json.clientID);
        break;
      default:
        this.default._onServerMessage(json);
    }
  }
},

User: {
  host(hostType) {
    let req = hostTypeObject(hostType);
    req.type = 'HOST';

    this.serverConnection.then(()=>{
      this._ws.send(JSON.stringify(req));
    });
    this._changeType('Host');
    this._setThen(this.hosting);
    return this;
  },
  join(hostType) {
    let req = hostTypeObject(hostType);
    req.type = 'CONNECT';

    this.serverConnection.then(()=>{
      this._ws.send(JSON.stringify(req));
    });
    this._changeType('Client');
    this._setThen(this.joined);
    return this;
  }
}};

class NexusBase {
  constructor(nexusServerAddress) {
    this._type = null;
    this.nexusServerAddress = nexusServerAddress;
    this.default = this.__proto__;

    this.serverConnection = promise();
    this.lostServerConnection = promise();
    this.hosting = promise(); // when we have registered as a host
    this.joined = promise(); // when we have joined a host

    this.onList = createPromiseEventListener();

    this._ws = new WebSocket(nexusServerAddress);
    this._ws.onmessage = e => {
      this._log('_onServerMessage:', e.data);
      const json = JSON.parse(e.data);
      this._onServerMessage(json);
    };
    this._ws.onopen = this.serverConnection.resolve;
    this._ws.onclose = this.lostServerConnection.resolve;

    this._setThen(this.serverConnection);
    this._changeType('User');
  }

  get type() {
    return this._type;
  }

  getHosts() {
    this._ws.send('{"type":"LIST"}');
    return this.onList;
  }

  close(code=1000, reason="User closed their connection") {
    this._ws.close(code, reason);
    return this.lostServerConnection;
  }

  _onServerMessage(json) {
    switch(json.type) {
      case 'LIST':
        this.onList.trigger(json.payload);
        break;
      default:
        console.log('(ignorning message:', json);
    }
  }

  _log(...args) {
    if(this.debug) {
      console.log(...args);
    }
  }

  // Allow .then/await to be used on an instance of this class
  _setThen(promise) {
    this.then = resolve => {
      promise.then(()=>{
        this.then = undefined; // prevent infinite cycle when awaiting this thenable object that returns this same object
        resolve(this);
      });
      return this;
    }
  }

  // Modifies the properties on this object to make it a different "type"
  _changeType(to) {
    removeType(this, this.type);
    addType(this, to);
  }
}

// ========================================= Helpers ========================================= //

function removeType(obj, typeName) {
  if(typeName) {
    if(obj._type !== typeName) {
      throw new Error(`Cannot remove type "${typeName}" when object has type "${obj._type}"`);
    }
    if(!(typeName in NexusTypes)) {
      throw new Error('Invalid typeName when removing type:', typeName);
    }
    obj._typeProps.forEach(prop => delete obj[prop]);
    delete obj._typeProps;
    obj._type = null;
  } else if(typeName === undefined) {
    throw new Error('Cannot remove type on object with undefined type (double check the correct object is passed and it has `._type` set as null or a valid type)');
  }
}

function addType(obj, typeName) {
  if(!(typeName in NexusTypes)) {
    throw new Error('Invalid typeName when adding type:', typeName);
  }

  const props = NexusTypes[typeName];
  Object.assign(obj, props);
  obj._typeProps = Object.keys(props);
  obj._type = typeName;
}

function promise(resolver=()=>{}) {
  let resolve;
  let reject;
  const promise = new Promise((res, rej)=>resolver(resolve = res, reject = rej));
  promise.resolve = resolve;
  promise.reject = reject;
  return promise;
}

function createPromiseEventListener() {
  let anyNonce = false;
  let listeners = [];

  function promiseEventListener(callback, name) {
    listeners.push(callback);
    return promiseEventListener;
  }

  promiseEventListener.then = function(callback, name) {
    anyNonce = true;
    callback._PromiseEventNonce = true;
    listeners.push(callback);
    return promiseEventListener;
  }

  promiseEventListener.trigger = function(...args) {
    const current = listeners;
    if(anyNonce) {
      // Remove one-time listeners
      listeners = listeners.filter(l => {
        if(!l._PromiseEventNonce) return true;
        delete l._PromiseEventNonce;
      });
      anyNonce = false;
    }
    current.forEach(callback => callback(...args));
  }
  return promiseEventListener;
}

function hostTypeObject(hostType) {
  let obj;
  switch(typeof hostType) {
    case 'string':
      obj = { hostName: hostType };
      break;
    case 'number':
      obj = { hostID: hostType };
      break;
    case 'object':
      obj = hostType;
      break;
    default:
      throw new Error('Invalid hostType:', hostType);
  }
  return obj;
}

return (serverAddress='ws://127.0.0.1:3000') => new NexusBase(serverAddress);

})();
