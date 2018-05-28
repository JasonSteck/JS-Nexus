class Client {
  // options: { host, request }
  constructor(ws, options) {
    this.ws = ws;
    this.options = options;

    ws.on('message', this.onMessage.bind(this));
    ws.on('close', this.onClose.bind(this));

    this.host = options.host;

    this.ws.send(JSON.stringify({
      type: 'CONNECTED',
      hostID: this.host.hostID,
      hostName: this.host.hostName,
      request: options.request,
    }));
  }

  setID(clientID) {
    this.clientID = clientID;
  }

  onMessage(str) {
    try {
      log('+ request from Client:', str);
      this.host.ws.send(JSON.stringify({
        type: 'FROM_CLIENT',
        clientID: this.clientID,
        message: str,
      }));
    } catch (e) {
      log('ERROR client onMessage: ',e,'\n- Trying to Process: `'+str+'`');
    }
  }

  close(code, reason) {
    this.ws.close(code, reason);
  }

  onClose() {
    log('* Lost Client Connection');
    this.host.clientLost(this.clientID);
  }
}

module.exports = Client;