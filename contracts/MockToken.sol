pragma solidity >=0.5.0 < 0.7.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
  constructor(uint256 initialSupply) public {
    _mint(msg.sender, initialSupply);
  }
}
