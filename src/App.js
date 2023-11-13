import "./App.css";
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { InjectorABI } from "./abi/Injector";
import { ERC20 } from "./abi/erc20";

function App() {
  const provider = new ethers.providers.JsonRpcProvider("https://avalanche.public-rpc.com");
  const contractAddress = "0xF23d8342881eDECcED51EA694AC21C2B68440929";
  const contract = new ethers.Contract(contractAddress, InjectorABI, provider);

  const [addresses, setAddresses] = useState([]);
  const [accountInfo, setAccountInfo] = useState({});
  const [contractBalance, setContractBalance] = useState("");

  async function getAccountInfoForAddress(address) {
    try {
      const result = await contract.getAccountInfo(address);
      setAccountInfo((prevInfo) => ({ ...prevInfo, [address]: result }));
    } catch (error) {
      console.error(`Error fetching info for address ${address}:`, error);
    }
  }

  async function getWatchList() {
    try {
      const result = await contract.getWatchList();
      setAddresses(result);
      result.forEach((address) => {
        getAccountInfoForAddress(address);
      });
    } catch (error) {
      console.error("Error:", error);
    }
  }

  const totalProduct = addresses.reduce((sum, address) => {
    const amountPerPeriod = accountInfo[address]?.amountPerPeriod || 0;
    const maxPeriods = accountInfo[address]?.maxPeriods || 0;
    return sum + (amountPerPeriod / 10 ** 18) * maxPeriods;
  }, 0);

  const totalAmountDistributed = addresses.reduce((sum, address) => {
    const amountPerPeriod = accountInfo[address]?.amountPerPeriod || 0;
    const periodNumber = accountInfo[address]?.periodNumber || 0;
    return sum + (amountPerPeriod / 10 ** 18) * periodNumber;
  }, 0);

  async function getInjectTokenBalanceForAddress() {
    const injectTokenAddress = await contract.getInjectTokenAddress();
    const addressToCheck = "0xF23d8342881eDECcED51EA694AC21C2B68440929"; // Use the full Ethereum address

    // Create an instance of the ERC-20 contract using ethers
    const tokenContract = new ethers.Contract(injectTokenAddress, ERC20, provider);

    // Query the balance using the balanceOf function of the ERC-20 contract
    const balanceForAddress = await tokenContract.balanceOf(addressToCheck);

    setContractBalance(ethers.utils.formatUnits(balanceForAddress, 18)); // Assuming 18 decimals for the token
  }

  useEffect(() => {
    getWatchList();
    getInjectTokenBalanceForAddress();
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Watch List Addresses</h1>
      </header>
      <main>
        {addresses.length > 0 ? (
          <table className="bordered-table">
            <thead>
              <tr>
                <th>Address</th>
                <th>Amount Per Period</th>
                <th>Is Active</th>
                <th>Max Periods</th>
                <th>Period Number</th>
                <th>Last Injection Time</th>
                <th>Last Injection Converted Time</th>
              </tr>
            </thead>
            <tbody>
              {addresses.map((address, index) => (
                <tr key={index}>
                  <td>{address}</td>
                  <td>{accountInfo[address]?.amountPerPeriod / 10 ** 18 || "Loading..."}</td>
                  <td>{accountInfo[address]?.isActive.toString() || "Loading..."}</td>
                  <td>{accountInfo[address]?.maxPeriods.toString() || "Loading..."}</td>
                  <td>{accountInfo[address]?.periodNumber.toString() || "Loading..."}</td>
                  <td>{accountInfo[address]?.lastInjectionTimeStamp.toString() || "Loading..."}</td>
                  <td>{accountInfo[address]?.lastInjectionTimeStamp ? new Date(accountInfo[address]?.lastInjectionTimeStamp * 1000).toUTCString() : "Loading..."}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No addresses found in the watchlist.</p>
        )}
        <p>Total Amount to be Distributed: {totalProduct.toLocaleString("en-US", { useGrouping: false })}</p>
        <br />
        <p>Total Amount Distributed: {totalAmountDistributed.toLocaleString("en-US", { useGrouping: false })}</p>
        <br />
        <p>Remaining Inject Token: {contractBalance}</p>
      </main>
    </div>
  );
}

export default App;
