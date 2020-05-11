pragma solidity >=0.5.0 < 0.7.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";

contract MockToken is ERC20, ERC20Detailed {
  constructor(uint256 initialSupply) ERC20Detailed("Test USDT", "tUSDT", 6) public {
    _mint(msg.sender, initialSupply);
  }
}
