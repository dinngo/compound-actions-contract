pragma solidity ^0.5.0;
import "./Foo2.sol";

contract Foo2Factory {
    mapping(uint256 => address) private _foos;
    uint256 private _nFoo;

    constructor() public {
        _nFoo = 0;
        createFoo();
    }

    function addressOf(uint256 index) public view returns (address foo) {
        require(index < _nFoo);
        return _foos[index];
    }

    function createFoo() public {
        Foo2 f = new Foo2();
        _foos[_nFoo] = address(f);
        _nFoo++;
    }
}
