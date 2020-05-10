
const VestingModule = artifacts.require("VestingModule");
const Migrations = artifacts.require("Migrations");
const GnosisSafe = artifacts.require("@gnosis.pm/safe-contracts/GnosisSafe");


contract('VestingModule', function(accounts) {
  let gnosisSafe;
  let vestingModule;
  let lw;

  const CALL = 0

  beforeEach(async function () {
    const migration = await Migrations.deployed();
    const safeAddress = await migration.safeAddress();
    gnosisSafe = await GnosisSafe.at(safeAddress);

    const modules = await gnosisSafe.getModules();
    vestingModule = await VestingModule.at(modules[0]);

    console.log('safe', safeAddress);
    console.log('module', vestingModule.address);
    console.log('manager', await vestingModule.manager.call());
  });

  it('should bla', async () => {

  });

});