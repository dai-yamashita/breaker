var bag = require('bagofholding'),
  buster = require('buster'),
  Breaker = require('../lib/breaker'),
  fsx = require('fs.extra');

buster.testCase('breaker - init', {
  'should copy sample .breaker.json file to current directory when init is called': function (done) {
    this.stub(fsx, 'copy', function (src, dest, cb) {
      assert.isTrue(src.match(/\/examples\/.breaker.json$/).length === 1);
      assert.equals(dest, '.breaker.json');
      cb();
    });
    var breaker = new Breaker();
    breaker.init(function (err, result) {
      assert.equals(err, undefined);
      done();
    });
  }
});

buster.testCase('breaker - format', {
  setUp: function () {
    this.mockConsole = this.mock(console);
  },
  'should use specified typed formatter and log output': function (done) {
    this.mockConsole.expects('log').once().withExactArgs('clusters = dev\n\ndev = dev1.com');
    var breaker = new Breaker();
    breaker._config = function () {
      return [{ host: 'dev1.com', labels: ['dev'] }];
    };
    breaker.format('clusterssh', function (err, result) {
      assert.equals(err, undefined);
      done();
    });
  }
});

buster.testCase('breaker - ssh', {
  setUp: function () {
    this.mockCli = this.mock(bag.cli);
    this.mockConsole = this.mock(console);
  },
  'should exec ssh command to hosts': function (done) {
    this.mockCli.expects('exec').once().withArgs('ssh -i id_rsa1 user1@dev1.com:22 \'df -kh;\'', true).callsArgWith(2);
    this.mockCli.expects('exec').once().withArgs('ssh -i id_rsa2 user2@dev2.com:22 \'df -kh;\'', true).callsArgWith(2);
    this.mockCli.expects('exec').once().withArgs('ssh -i id_rsa3 user3@dev3.com:22 \'df -kh;\'', true).callsArgWith(2);
    this.mockConsole.expects('log').once().withExactArgs('+ %s', 'dev1.com');
    this.mockConsole.expects('log').once().withExactArgs('+ %s', 'dev2.com');
    this.mockConsole.expects('log').once().withExactArgs('+ %s', 'dev3.com');
    var breaker = new Breaker();
    breaker._config = function () {
      return [
        { "host": "dev1.com", "port": 22, "user": "user1", "key": "id_rsa1", "labels": "dev1" },
        { "host": "dev2.com", "port": 22, "user": "user2", "key": "id_rsa2", "labels": "dev2" },
        { "host": "dev3.com", "port": 22, "user": "user3", "key": "id_rsa3", "labels": "dev3" }
        ];
    };
    breaker.ssh('df -kh;', function (err, results) {
      assert.isNull(err);
      done();
    });
  },
  'should create ssh command without key, with default user, and no port': function (done) {
    this.mockCli.expects('exec').once().withArgs('ssh  dev1.com \'df -kh;\'', true).callsArgWith(2);
    this.mockConsole.expects('log').once().withExactArgs('+ %s', 'dev1.com');
    var breaker = new Breaker();
    breaker._config = function () {
      return [
        { "host": "dev1.com", "labels": "dev1" }
        ];
    };
    breaker.ssh('df -kh;', function (err, results) {
      assert.isNull(err);
      done();
    });
  }
});

buster.testCase('breaker - _config', {
  setUp: function () {
    this.mockCli = this.mock(bag.cli);
  },
  'should return only config with specified label': function () {
    this.mockCli.expects('lookupFile').once().returns('[' +
      '{"host":"dev1.com","labels":["dev"]},' +
      '{"host":"prod1.com","labels":["prod"]},' +
      '{"host":"dev2.com","labels":["dev","build"]},' +
      '{"host":"test1.com","labels":["test"]}]');
    var filtered = new Breaker({ labels: ['prod'] })._config();
    assert.equals(filtered.length, 1);
    assert.equals(filtered[0].host, 'prod1.com');
  },
  'should return only config with specified label when there are multiple labels': function () {
    this.mockCli.expects('lookupFile').once().returns('[' +
      '{"host":"dev1.com","labels":["dev"]},' +
      '{"host":"prod1.com","labels":["prod"]},' +
      '{"host":"dev2.com","labels":["dev","build"]},' +
      '{"host":"test1.com","labels":["test"]}]');
    var filtered = new Breaker({ labels: ['prod', 'test'] })._config();
    assert.equals(filtered.length, 2);
    assert.equals(filtered[0].host, 'prod1.com');
    assert.equals(filtered[1].host, 'test1.com');
  },
  'should return all config when there is no label': function () {
    this.mockCli.expects('lookupFile').once().returns('[' +
      '{"host":"dev1.com","labels":["dev"]},' +
      '{"host":"prod1.com","labels":["prod"]},' +
      '{"host":"dev2.com","labels":["dev","build"]},' +
      '{"host":"test1.com","labels":["test"]}]');
    var filtered = new Breaker()._config();
    assert.equals(filtered.length, 4);
    assert.equals(filtered[0].host, 'dev1.com');
    assert.equals(filtered[1].host, 'prod1.com');
    assert.equals(filtered[2].host, 'dev2.com');
    assert.equals(filtered[3].host, 'test1.com');
  },
  'should return empty array when config is empty': function () {
    this.mockCli.expects('lookupFile').once().returns('[]');
    var filtered = new Breaker()._config();
    assert.equals(filtered.length, 0);
  },
  'should remove filtered out labels': function () {
    this.mockCli.expects('lookupFile').once().returns('[' +
      '{"host":"dev1.com","labels":["dev"]},' +
      '{"host":"prod1.com","labels":["prod","live"]},' +
      '{"host":"dev2.com","labels":["dev","build"]},' +
      '{"host":"xyz.com","labels":["prod","test","dev","build"]},' +
      '{"host":"test1.com","labels":["ci","test","qa"]}]');
    var filtered = new Breaker({ labels: ['prod', 'test'] })._config();
    assert.equals(filtered.length, 3);
    assert.equals(filtered[0].host, 'prod1.com');
    assert.equals(filtered[0].labels.length, 1);
    assert.equals(filtered[0].labels[0], 'prod');
    assert.equals(filtered[1].host, 'xyz.com');
    assert.equals(filtered[1].labels.length, 2);
    assert.equals(filtered[1].labels[0], 'prod');
    assert.equals(filtered[1].labels[1], 'test');
    assert.equals(filtered[2].host, 'test1.com');
    assert.equals(filtered[2].labels.length, 1);
    assert.equals(filtered[2].labels[0], 'test');
  },
  'should handle regex labels': function () {
    this.mockCli.expects('lookupFile').once().returns('[' +
      '{"host":"dev1.com","labels":["dev"]},' +
      '{"host":"prod1.com","labels":["prod"]},' +
      '{"host":"dev2.com","labels":["dev","build"]},' +
      '{"host":"test1.com","labels":["test"]}]');
    var filtered = new Breaker({ labels: ['.*e.*'] })._config();
    assert.equals(filtered.length, 3);
    assert.equals(filtered[0].host, 'dev1.com');
    assert.equals(filtered[1].host, 'dev2.com');
    assert.equals(filtered[2].host, 'test1.com');
  },
  'should handle position aware labels': function () {
    this.mockCli.expects('lookupFile').once().returns('[' +
      '{"host":"dev1.com","labels":["dev"]},' +
      '{"host":"prod1.com","labels":["prod"]},' +
      '{"host":"dev2.com","labels":["dev","build"]},' +
      '{"host":"test1.com","labels":["test"]}]');
    var filtered = new Breaker({ labels: ['ld$', '^p'] })._config();
    assert.equals(filtered.length, 2);
    assert.equals(filtered[0].host, 'prod1.com');
    assert.equals(filtered[1].host, 'dev2.com');
  },
  'should handle labels containing dash': function () {
    this.mockCli.expects('lookupFile').once().returns('[' +
      '{"host":"dev1.com","labels":["dev-app"]},' +
      '{"host":"prod1.com","labels":["prod-db"]},' +
      '{"host":"dev2.com","labels":["dev-app","build"]},' +
      '{"host":"test1.com","labels":["test-util"]}]');
    var filtered = new Breaker({ labels: ['^dev-', 'whatever'] })._config();
    assert.equals(filtered.length, 2);
    assert.equals(filtered[0].host, 'dev1.com');
    assert.equals(filtered[1].host, 'dev2.com');
  }
});