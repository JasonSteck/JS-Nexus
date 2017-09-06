_WebSocket = window.WebSocket;
window.WebSocket = ()=>{ throw Error('WebSocket was called without being stubbed') };

describe('nexus-host.js', function() {
  const defaultNexusServer = 'ws://localhost:3000';
  const defaultHostName = 'myHostName';
  beforeEach(function() {
    this.stubWebSocket = () => {
      this.ws = {
        send: newSpy('send'),
      },
      stub(window).WebSocket.toReturn(this.ws);
    };

    this.newHost = ({nexusServer, hostName}={}) => (
      this.host = newNexusHost(
        nexusServer || defaultNexusServer,
        hostName || defaultHostName,
      )
    );

    this.triggerNewClient = ({clientID, request}={}) => {
      const data = JSON.stringify({
        type: 'NEW_CLIENT',
        clientID: clientID || 7,
        request: request || JSON.stringify({
          // to figure out
        })
      });
      this.ws.onmessage({ data });
    };

    this.triggerClientMessage = ({clientID, message}={}) => {
      const data = JSON.stringify({
        type: 'FROM_CLIENT',
        clientID: clientID || 7,
        payload: message || "HAHA",
      });
      this.ws.onmessage({ data });
    };

    this.triggerClientLost = (clientID) => {
      const data = JSON.stringify({
        type: 'LOST_CLIENT',
        payload: clientID || 7,
      });
      this.ws.onmessage({ data });
    };
  });

  describe('#newNexusHost(nexusServer, hostName, [options])', function() {
    it('throws an error if a nexusServer address is not provided', function() {
      expect(() => newNexusHost()).toThrow(new Error('Missing nexusServer address'));
    });

    it('throws an error if a hostName is not provided', function() {
      expect(() => newNexusHost('ws://localhost:3000')).toThrow(new Error('Missing hostName'));
    });

    it('connects to the nexus server', function() {
      this.stubWebSocket();
      this.newHost();
      expect(window.WebSocket).toHaveBeenCalledWith(defaultNexusServer);
    });

    describe('after connecting', function() {
      it('tries to register', function() {
        this.stubWebSocket();
        this.newHost();
        expect(()=>this.ws.onopen()).not.toThrow();

        expect(this.ws.send).toHaveBeenCalledWith({
          type: 'HOST',
          payload: defaultHostName,
        });
      });
    });
  });

  describe('if connection fails', function() {
    it('calls the .onerror if provided', function() {
      this.stubWebSocket();
      this.newHost().onError = (event) => { this.event = event };
      let err = {data:'err'};

      this.ws.onerror(err); // simulate error

      expect(this.event).toBe(err);
    });

    it('does not crash if there is no .onerror callback specified', function() {
      this.stubWebSocket();
      this.newHost();

      expect(()=>this.ws.onerror(err)).not.toThrow();
    });
  });

  describe('when a new user connects', function() {
    it('calls the .onNewClient if provided', function() {
      this.stubWebSocket();
      const callback = newSpy('onNewClient');
      this.newHost().onNewClient = callback;

      const clientID = 5;
      const request = {};
      this.triggerNewClient({clientID, request}); // simulate event

      expect(callback).toHaveBeenCalledWith(clientID, request);
    });

    it('does not crash if there is no callback specified', function() {
      this.stubWebSocket();
      this.newHost();

      expect(()=>this.triggerNewClient()).not.toThrow();
    });
  });

  describe('when we get something from the user', function() {
    it('calls the .onClientMessage if provided', function() {
      this.stubWebSocket();
      const callback = newSpy('onClientMessage');
      this.newHost().onClientMessage = callback;

      const clientID = 5;
      const message = 'Yo';
      this.triggerClientMessage({clientID, message}); // simulate event

      expect(callback).toHaveBeenCalledWith(clientID, message);
    });

    it('does not crash if there is no callback specified', function() {
      this.stubWebSocket();
      this.newHost();

      expect(()=>this.triggerClientMessage()).not.toThrow();
    });
  });

  describe('when the user gets disconnected', function() {
    it('calls the .onClientLost if provided', function() {
      this.stubWebSocket();
      const callback = newSpy('onClientLost');
      this.newHost().onClientLost = callback;

      const clientID = 5;
      this.triggerClientLost(clientID); // simulate event

      expect(callback).toHaveBeenCalledWith(clientID);
    });

    it('does not crash if there is no callback specified', function() {
      this.stubWebSocket();
      this.newHost().onClientLost = null;

      expect(()=>this.triggerClientLost()).not.toThrow();
    });
  });
});
