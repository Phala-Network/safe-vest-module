# VestingModule

This project is a [Gnosis Safe Module](https://docs.gnosis.io/safe/docs/contracts_details/#modules)
that allows periodically vesting of some tokens. You set the interval between each vest, the token,
the amount, and the beneficiary of the vest. Then you can ask the module to release the unlocked
tokens whenever you like, without the need of the Safe wallet signatures.

Tested with:

```text
Truffle v5.1.25 (core: 5.1.25)
Solidity - 0.5.17 (solc-js)
Node v12.16.2
```

## Init

The module can be attached to a Safe wallet when initializing. Reference migration code ([link](migrations/3_deploy_safe_instance.js))

```js
    const moduleData = await vestingModuleMasterCopy.contract.methods.setup(
      [usdtToken.address],  // token
      [startTime],  // start time
      [interval],   // interval
      [amount],  // amount
      [to]   // to
    ).encodeABI();
    const proxyFactoryData = await proxyFactory.contract.methods.createProxy(vestingModuleMasterCopy.address, moduleData).encodeABI();
    const modulesCreationData = utils.processModulesData(web3, [proxyFactoryData]);
    const createAndAddModulesData = await createAndAddModules.contract.methods.createAndAddModules(proxyFactory.address, modulesCreationData).encodeABI();

    // prepare craete module call
    const gnosisSafeData = await gnosisSafeMasterCopy.contract.methods.setup(
      [accounts[0]], 1, createAndAddModules.address, createAndAddModulesData,
      utils.Address0, utils.Address0, 0, utils.Address0
    ).encodeABI();

    const tx = await proxyFactory.createProxy(gnosisSafeMasterCopy.address, gnosisSafeData);
    const gnosisSafeAddress = utils.getParamFromTxEvent(tx, 'ProxyCreation', 'proxy', proxyFactory.address);
```

Parameters:

- `token`: Zero address for Ether, otherwise an ERC20 token address
- `startTime`: The time of the first unlock (unix timestamp in seconds). Must be later than the
   block time of the setup transaction
- `interval`: The interval between vests in seconds
- `amount`: The amount of each vest
- `to`: The address of the beneficiary

## Check avaiable vest

- All unlocked rounds: `vestingModule.unlockedVest(tokenAddress)`
- Available rounds: `vestingModule.availableVest(tokenAddress)`

## Trigger Vest

Simply call `vestingModule.execute(tokenAddress)` from any Ethereum account.

## Test

```bash
truffle test ./test/vestingModule.js
```
