const {
  balance,
  BN,
  constants,
  ether,
  expectEvent,
  expectRevert,
} = require('@openzeppelin/test-helpers');
const { tracker } = balance;
const abi = require('ethereumjs-abi');
const utils = web3.utils;

const { expect } = require('chai');

const { evmRevert, evmSnapshot, profileGas } = require('./utils/utils');

const Foo = artifacts.require('Foo');
const FooFactory = artifacts.require('FooFactory');
const FooHandler = artifacts.require('FooHandler');
const Foo2 = artifacts.require('Foo2');
const Foo2Factory = artifacts.require('Foo2Factory');
const Foo2Handler = artifacts.require('Foo2Handler');
const Foo3 = artifacts.require('Foo3');
const Foo3Handler = artifacts.require('Foo3Handler');
const Registry = artifacts.require('Registry');
const Proxy = artifacts.require('ProxyMock');

contract('Proxy', function([_, deployer, user]) {
  let id;
  let balanceUser;
  let balanceProxy;

  before(async function() {
    this.registry = await Registry.new();
    this.proxy = await Proxy.new(this.registry.address);
  });

  beforeEach(async function() {
    id = await evmSnapshot();
  });

  afterEach(async function() {
    await evmRevert(id);
  });

  describe('execute', function() {
    before(async function() {
      this.fooFactory = await FooFactory.new({ from: deployer });
      expect(this.fooFactory.address).to.be.eq(
        '0xFdd454EA7BF7ca88C1B7a824c3FB0951Fb8a1318'
      );
      await this.fooFactory.createFoo();
      await this.fooFactory.createFoo();
      this.foo0 = await Foo.at(await this.fooFactory.addressOf.call(0));
      this.foo1 = await Foo.at(await this.fooFactory.addressOf.call(1));
      this.foo2 = await Foo.at(await this.fooFactory.addressOf.call(2));
      this.fooHandler = await FooHandler.new();
      await this.registry.register(
        this.fooHandler.address,
        utils.asciiToHex('foo')
      );
    });

    it('single', async function() {
      const index = 0;
      const num = new BN('25');
      const data = abi.simpleEncode(
        'bar(uint256,uint256):(uint256)',
        index,
        num
      );
      await this.proxy.execMock(this.fooHandler.address, data);
      const result = await this.foo0.accounts.call(this.proxy.address);
      expect(result).to.be.bignumber.eq(num);
    });

    it('multiple', async function() {
      const index = [0, 1, 2];
      const num = [new BN('25'), new BN('26'), new BN('27')];
      const to = [
        this.fooHandler.address,
        this.fooHandler.address,
        this.fooHandler.address,
      ];
      const data = [
        abi.simpleEncode('bar(uint256,uint256):(uint256)', index[0], num[0]),
        abi.simpleEncode('bar(uint256,uint256):(uint256)', index[1], num[1]),
        abi.simpleEncode('bar(uint256,uint256):(uint256)', index[2], num[2]),
      ];
      await this.proxy.batchExec(to, data);
      const result = [
        await this.foo0.accounts.call(this.proxy.address),
        await this.foo1.accounts.call(this.proxy.address),
        await this.foo2.accounts.call(this.proxy.address),
      ];
      expect(result[0]).to.be.bignumber.eq(num[0]);
      expect(result[1]).to.be.bignumber.eq(num[1]);
      expect(result[2]).to.be.bignumber.eq(num[2]);
    });
  });

  describe('execute with token', function() {
    before(async function() {
      this.fooFactory = await Foo2Factory.new({ from: deployer });
      expect(this.fooFactory.address).to.be.eq(
        '0xaB7D1E16d471065629431aeABED38880170876f2'
      );
      await this.fooFactory.createFoo();
      await this.fooFactory.createFoo();
      this.foo0 = await Foo2.at(await this.fooFactory.addressOf.call(0));
      this.foo1 = await Foo2.at(await this.fooFactory.addressOf.call(1));
      this.foo2 = await Foo2.at(await this.fooFactory.addressOf.call(2));
      this.fooHandler = await Foo2Handler.new();
      await this.registry.register(
        this.fooHandler.address,
        utils.asciiToHex('foo2')
      );
    });

    beforeEach(async function() {
      balanceUser = await tracker(user);
      balanceProxy = await tracker(this.proxy.address);
    });

    it('single', async function() {
      const index = 0;
      const to = this.fooHandler.address;
      const data = abi.simpleEncode(
        'bar(uint256,uint256):(uint256)',
        ether('1'),
        index
      );
      await this.proxy.execMock(to, data, { value: ether('1') });
      expect(await balanceProxy.delta()).to.be.bignumber.eq(ether('0'));
      expect(
        await this.foo0.balanceOf.call(this.proxy.address)
      ).to.be.bignumber.eq(ether('0'));
    });

    it('multiple', async function() {
      const index = [0, 1, 2];
      const value = [ether('0.1'), ether('0.2'), ether('0.5')];
      const to = [
        this.fooHandler.address,
        this.fooHandler.address,
        this.fooHandler.address,
      ];
      const data = [
        abi.simpleEncode('bar(uint256,uint256):(uint256)', value[0], index[0]),
        abi.simpleEncode('bar(uint256,uint256):(uint256)', value[1], index[1]),
        abi.simpleEncode('bar(uint256,uint256):(uint256)', value[2], index[2]),
      ];
      const receipt = await this.proxy.batchExec(to, data, {
        from: user,
        value: ether('1'),
      });
      expect(await balanceProxy.delta()).to.be.bignumber.eq(ether('0'));
      expect(await balanceUser.delta()).to.be.bignumber.eq(
        ether('0')
          .sub(
            value[0]
              .add(value[1])
              .add(value[2])
              .div(new BN('2'))
          )
          .sub(new BN(receipt.receipt.gasUsed))
      );
      expect(
        await this.foo0.balanceOf.call(this.proxy.address)
      ).to.be.bignumber.eq(ether('0'));
      expect(await this.foo0.balanceOf.call(user)).to.be.bignumber.eq(
        value[0].div(new BN('2'))
      );
      expect(
        await this.foo1.balanceOf.call(this.proxy.address)
      ).to.be.bignumber.eq(ether('0'));
      expect(await this.foo1.balanceOf.call(user)).to.be.bignumber.eq(
        value[1].div(new BN('2'))
      );
      expect(
        await this.foo2.balanceOf.call(this.proxy.address)
      ).to.be.bignumber.eq(ether('0'));
      expect(await this.foo2.balanceOf.call(user)).to.be.bignumber.eq(
        value[2].div(new BN('2'))
      );
    });
  });

  describe('Direct transfer', function() {
    it('Should fail', async function() {
      await expectRevert.unspecified(
        web3.eth.sendTransaction({
          from: user,
          to: this.proxy.address,
          value: ether('1'),
        })
      );
    });
  });

  describe('execute with customized post process', function() {
    before(async function() {
      this.foo = await Foo3.new();
      this.fooHandler = await Foo3Handler.new();
      await this.registry.register(
        this.fooHandler.address,
        utils.asciiToHex('foo3')
      );
    });

    beforeEach(async function() {
      balanceUser = await tracker(user);
      balanceProxy = await tracker(this.proxy.address);
    });

    it('post process 1', async function() {
      const to = this.fooHandler.address;
      const data = abi.simpleEncode('bar1(address)', this.foo.address);
      await this.proxy.execMock(to, data, { value: ether('1') });
      expect(await this.foo.num.call()).to.be.bignumber.eq(new BN('1'));
    });

    it('post process 2', async function() {
      const to = this.fooHandler.address;
      const data = abi.simpleEncode('bar2(address)', this.foo.address);
      await this.proxy.execMock(to, data, { value: ether('1') });
      expect(await this.foo.num.call()).to.be.bignumber.eq(new BN('2'));
    });
  });
});
