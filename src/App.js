import "./App.css";
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { InjectorABI } from "./abi/Injector";
import { ERC20 } from "./abi/erc20";

function App() {
  const [addresses, setAddresses] = useState([]);
  const [accountInfo, setAccountInfo] = useState({});
  const [contractBalance, setContractBalance] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [jsonAddresses, setJsonAddresses] = useState([]);
  const [dropdownSelection, setDropdownSelection] = useState("");
  const [selectedNetwork, setSelectedNetwork] = useState("");

  const networkChoice = {
    mainnet: "https://ethereum.publicnode.com",
    polygon: "https://polygon.llamarpc.com",
    arbitrum: "https://arbitrum.llamarpc.com",
    gnosis: "https://rpc.gnosischain.com",
    zkevm: "https://zkevm-rpc.com",
    avalanche: "https://avalanche.public-rpc.com",
    base: "https://developer-access-mainnet.base.org",
  };

  const [provider, setProvider] = useState(new ethers.providers.JsonRpcProvider(networkChoice.mainnet));
  const [contract, setContract] = useState(new ethers.Contract(contractAddress, InjectorABI, provider));

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

  async function getInjectTokenBalanceForAddress() {
    const injectTokenAddress = await contract.getInjectTokenAddress();
    const tokenContract = new ethers.Contract(injectTokenAddress, ERC20, provider);
    const balanceForAddress = await tokenContract.balanceOf(contractAddress);
    setContractBalance(ethers.utils.formatUnits(balanceForAddress, 18));
  }

  const handleAddressSelect = (event) => {
    const fullSelection = event.target.value;
    setDropdownSelection(fullSelection);

    const [network, address] = fullSelection.split("-");
    setSelectedNetwork(network); // Set the selected network

    const providerUrl = networkChoice[network.toLowerCase()];
    if (providerUrl) {
      const newProvider = new ethers.providers.JsonRpcProvider(providerUrl);
      const newContract = new ethers.Contract(address, InjectorABI, newProvider);

      setContractAddress(address);
      setProvider(newProvider);
      setContract(newContract);
    }
  };

  useEffect(() => {
    fetch("https://raw.githubusercontent.com/BalancerMaxis/bal_addresses/main/outputs/addressbook.json")
      .then((response) => response.json())
      .then((data) => {
        let allAddressesWithOptions = [];
        const activeNetworks = data.active;

        // Iterate over each network and extract gaugeRewardsInjectors addresses
        for (const network in activeNetworks) {
          if (activeNetworks[network].maxiKeepers?.gaugeRewardsInjectors) {
            const gaugeRewardsInjectors = activeNetworks[network].maxiKeepers.gaugeRewardsInjectors;
            for (const token in gaugeRewardsInjectors) {
              const address = gaugeRewardsInjectors[token];
              allAddressesWithOptions.push({ label: `${network} - ${address} [${token}]`, value: `${network}-${address}` });
            }
          }
        }

        setJsonAddresses(allAddressesWithOptions);
      })
      .catch((error) => console.error("Error fetching addresses:", error));
  }, []);

  useEffect(() => {
    if (contractAddress && selectedNetwork) {
      getWatchList();
      getInjectTokenBalanceForAddress();
    }
  }, [contractAddress, selectedNetwork]);

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

  return (
    <div className="App">
      <header className="App-header">
        <div>
          <select onChange={handleAddressSelect} value={dropdownSelection}>
            <option value="" disabled>
              Select an address
            </option>
            {jsonAddresses.map((option, index) => (
              <option key={index} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <h1>Watch List Results</h1>
      </header>
      <main>
        {/* Conditionally render the table based on whether an address is selected */}
        {contractAddress && addresses.length > 0 ? (
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
                <th>Future Date</th>
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
                  <td>
                    {accountInfo[address]?.isActive && accountInfo[address]?.periodNumber < accountInfo[address]?.maxPeriods
                      ? new Date(accountInfo[address]?.lastInjectionTimeStamp * 1000 + 7 * 24 * 3600 * 1000).toUTCString()
                      : "N/A"}
                  </td>
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
