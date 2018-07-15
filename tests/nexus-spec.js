const server = 'ws://127.0.0.1:3000';

describe('JS-Nexus', function() {

  // Throw error if a Nexus server is not running
  new EnsureConnection();

  setSpecHelper(NexusSpecHelpers);

  afterEach(async function() {
    // await this.closeAllConnections(); // comes from NexusSpecHelpers
  });

  describe('a user', function() {
    let user;
    beforeEach(async function(){
      user = await Nexus(server);
    });

    describe('getHosts()', function() {
      it('only returns active hosts', async function() {
        const host1 = await Nexus(server).host('Pac-Man');
        const host2 = await Nexus(server).host('Donkey Kong');

        let list = await user.getHosts();
        this.expectHostToBeListed(host1, list);
        this.expectHostToBeListed(host2, list);

        await host1.close();
        list = await user.getHosts();
        this.expectHostNotToBeListed(host1, list);
        this.expectHostToBeListed(host2, list);

        await host2.close();
        list = await timebox(user.getHosts());
        this.expectHostNotToBeListed(host1, list);
        this.expectHostNotToBeListed(host2, list);
      });
    });

    it('can connect to a host by name', async function() {
      const name = 'Frogger';
      const host = await Nexus(server).host(name);

      const onNewClient = host.onNewClient.then((id, request) => {
        expect(id).toBe(1);
        expect(request).toEqual({
          type: 'CONNECT',
          hostName: name,
        });
      });
      await user.join(name);
      await onNewClient;
    });

    it('can connect to a host by id', async function() {
      const host = await Nexus(server).host("Asteroids");

      const onNewClient = host.onNewClient.then((id, request) => {
        expect(id).toBe(1);
        expect(request).toEqual({
          type: 'CONNECT',
          hostID: host.id,
        });
      });
      await user.join(host.id);
      await onNewClient;
    });

    when('connected to a host', function() {
      beforeEach(async function() {
        this.host = await Nexus(server).host('Space Invaders');

        user.join(this.host.id);
        await this.host.onNewClient;
        await user.joined;
      });

      it('can send messages to the host', async function() {
        const msg = "Hello there";
        user.send(msg);

        await this.host.onMessage.then((message, id) => {
          expect(message).toBe(msg);
          expect(id).toBe(1);
        });
      });
    });
  });
});
