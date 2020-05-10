const VestingModule = artifacts.require("VestingModule");

module.exports = function(deployer) {
  deployer.then(async () => {
    await deployer.deploy(VestingModule);
    const vestingModuleMasterCopy = await VestingModule.deployed();
    await vestingModuleMasterCopy.setup([], []);
  });
};
