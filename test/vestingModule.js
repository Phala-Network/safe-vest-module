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

  const CALL = 0

  before(async function () {
    const migration = await Migrations.deployed();
    const safeAddress = await migration.safeAddress();
    gnosisSafe = await GnosisSafe.at(safeAddress);

    const modules = await gnosisSafe.getModules();
    vestingModule = await VestingModule.at(modules[0]);

    const newToken = await MockToken.new(new BN(150));
    token = await MockToken.at(newToken.address);

    await web3.eth.sendTransaction({from: accounts[0], to: gnosisSafe.address, value: web3.utils.toWei('250', 'wei')})
    await token.transfer(gnosisSafe.address, new BN(150));
  });

  it('should set ether vest plan', async () => {
    assert(!await vestingModule.hasVest(utils.Address0), 'No ether vest yet');
    // Add vest plan (100 ether per 100s)
    const now = await utils.getBlockTimestamp(web3);
    const data = await vestingModule.contract.methods.setVest(
      utils.Address0, now + 600, 100, 100, accounts[0]
    ).encodeABI();
    await executeTransaction(
      'add a vest plan with token', [accounts[0]],
      vestingModule.address, 0, data,
      CALL
    );
    // Check vest plan added
    assert(await vestingModule.hasVest(utils.Address0), 'Token vest added');
    assert(
      (await vestingModule.availableVest(utils.Address0)).eq(new BN(0)),
      'Token vest not started'
    );
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

  it('should reject adding a vest plan directly', async () => {
    const now = await utils.getBlockTimestamp(web3);
    await truffleAssert.reverts(
      vestingModule.setVest(token.address, now + 600, 100, 100, accounts[1]),
      'Method can only be called from manager.'
    );
  });

  it('should add a token vest plan', async () => {
    assert(!await vestingModule.hasVest(token.address), 'No token vest yet');
    // Add vest plan (100 tokens per 100s)
    const now = await utils.getBlockTimestamp(web3);
    const data = await vestingModule.contract.methods.setVest(
      token.address, now + 600, 100, 100, accounts[1]
    ).encodeABI();
    await executeTransaction(
      'add a vest plan with token', [accounts[0]],
      vestingModule.address, 0, data,
      CALL
    );
    // Check vest plan added
    assert(await vestingModule.hasVest(token.address), 'Token vest added');
    assert(
      (await vestingModule.availableVest(token.address)).eq(new BN(0)),
      'Token vest not started'
    );
  });

  it('should vest token', async () => {
    assert(
      (await token.balanceOf(gnosisSafe.address)).eq(new BN(150)),
      'Should have 150 token'
    );
    // Withdraw 100 in the first batch
    await chainWait(600);
    await vestingModule.execute(token.address);
    assert(
      (await token.balanceOf(gnosisSafe.address)).eq(new BN(50)),
      'Should have 50 token'
    );
    // Withdraw the remaining
    await chainWait(100);
    await vestingModule.execute(token.address);
    assert(
      (await token.balanceOf(gnosisSafe.address)).eq(new BN(0)),
      'Should have no token'
    );
  })

  it('should revert if call authorized methods', async () => {
    await truffleAssert.reverts(
      vestingModule.removeVest(utils.Address0),
      'Method can only be called from manager.'
    )
  });

  const executor = accounts[0];
  async function executeTransaction(subject, accounts, to, value, data, operation, opts) {
    let options = opts || {}
    let txSender = options.sender || executor 
    let nonce = await gnosisSafe.nonce()
    let txHash = await gnosisSafe.getTransactionHash(to, value, data, operation, 0, 0, 0, utils.Address0, utils.Address0, nonce)

    let sigs = "0x"
    for (let account of (accounts.sort())) {
        if (account != txSender) {
            utils.logGasUsage("confirm by hash " + subject + " with " + account, await gnosisSafe.approveHash(txHash, {from: account}))
        }
        sigs += "000000000000000000000000" + account.replace('0x', '') + "0000000000000000000000000000000000000000000000000000000000000000" + "01"
    }

    let tx = await gnosisSafe.execTransaction(to, value, data, operation, 0, 0, 0, utils.Address0, utils.Address0, sigs, {from: txSender})
    utils.logGasUsage(subject, tx)
    return tx
  }
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