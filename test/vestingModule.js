const GnosisSafe = artifacts.require("@gnosis.pm/safe-contracts/GnosisSafe");
const VestingModule = artifacts.require("VestingModule");
const Migrations = artifacts.require("Migrations");
const MockToken = artifacts.require("MockToken");
const BN = web3.utils.BN;

const truffleAssert = require('truffle-assertions');
const utils = require("../lib/utils");


contract('VestingModule', function(accounts) {
  let gnosisSafe;
  let vestingModule;
  let token;
  let lw;

  const CALL = 0

  before(async function () {
    const migration = await Migrations.deployed();
    const safeAddress = await migration.safeAddress();
    gnosisSafe = await GnosisSafe.at(safeAddress);

    const modules = await gnosisSafe.getModules();
    vestingModule = await VestingModule.at(modules[0]);

    // console.log('safe', safeAddress);
    // console.log('module', vestingModule.address);
    // console.log('manager', await vestingModule.manager.call());

    const newToken = await MockToken.new(new BN('100'));
    token = await MockToken.at(newToken.address);

    await web3.eth.sendTransaction({from: accounts[0], to: gnosisSafe.address, value: web3.utils.toWei('250', 'wei')})
  });

  it('should revert when no vest available', async () => {
    await truffleAssert.reverts(
      vestingModule.execute(utils.Address0),
      'No available vest');
  });

  it('should allow transfer after start', async () => {
    await chainWait(600);
    const availableVest = await vestingModule.availableVest(utils.Address0);
    assert(availableVest.eq(new BN(1)), 'Should have one unlocked vest');
    // withdraw it
    const startBlance = new BN(await web3.eth.getBalance(gnosisSafe.address));
    truffleAssert.eventEmitted(await vestingModule.execute(utils.Address0), 'TransferVested');
    const endBalance = new BN(await web3.eth.getBalance(gnosisSafe.address));
    assert(endBalance.eq(startBlance.sub(new BN(100))), '100 wei withdrew from safe');
  });

  it('should allow one more transfer in the second batch', async () => {
    await chainWait(100);
    assert(
      (await vestingModule.availableVest(utils.Address0)).eq(new BN(1)),
      'Should have one more unlocked vest'
    );
    // withdraw it
    const startBlance = new BN(await web3.eth.getBalance(gnosisSafe.address));
    truffleAssert.eventEmitted(await vestingModule.execute(utils.Address0), 'TransferVested');
    const endBalance = new BN(await web3.eth.getBalance(gnosisSafe.address));
    assert(endBalance.eq(startBlance.sub(new BN(100))), '100 wei withdrew from safe');
  });

  it('should withdraw the remaining 50 wei', async () => {
    await chainWait(100);
    assert(
      (await vestingModule.availableVest(utils.Address0)).eq(new BN(1)),
      'Should have one more unlocked vest'
    );
    // withdraw it
    truffleAssert.eventEmitted(await vestingModule.execute(utils.Address0), 'TransferVested');
    const endBalance = new BN(await web3.eth.getBalance(gnosisSafe.address));
    assert(endBalance.eq(new BN(0)), 'All ether were sent');
  });

});

const advanceBlockAtTime = (time) => {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "evm_mine",
        params: [time],
        id: new Date().getTime(),
      },
      (err, _) => {
        if (err) {
          return reject(err);
        }
        const newBlockHash = web3.eth.getBlock("latest").hash;

        return resolve(newBlockHash);
      },
    );
  });
};

async function chainWait(dt) {
  const now = await utils.getBlockTimestamp(web3);
  await advanceBlockAtTime(now + dt);
}