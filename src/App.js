import "./App.css";
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ethers } from "ethers";
import { InjectorABI } from "./abi/Injector";
import { ERC20 } from "./abi/erc20";
import { poolsABI } from "./abi/pools";
import { gaugeABI } from "./abi/gauge";

function App() {
  const [addresses, setAddresses] = useState([]);
  const [accountInfo, setAccountInfo] = useState({});
  const [contractBalance, setContractBalance] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [jsonAddresses, setJsonAddresses] = useState([]);
  const [dropdownSelection, setDropdownSelection] = useState("");
  const [selectedNetwork, setSelectedNetwork] = useState("");
  const [injectTokenAddress, setInjectTokenAddress] = useState("");
  const [poolNames, setPoolNames] = useState({});

  const params = useParams();
  const urlNetwork = params.network;
  const urlAddress = params.address;

  const tokenDecimals = {
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 6, // mainnet
    "0x2791bca1f2de4661ed88a30c99a7a9449aa84174": 6, // polygon
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831": 6, // arbitrum
    "0xddafbb505ad214d7b80b1f830fccc89b60fb7a83": 6, // gnosis
    "0xa8ce8aee21bc2a48a5ef670afcc9274c7bbbc035": 6, // zkevm
    "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e": 6, // avalanche
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913": 6, // base
  };

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

  async function fetchPoolName(address) {
    try {
      const lpTokenContract = new ethers.Contract(address, gaugeABI, provider);
      const lpTokenAddress = await lpTokenContract.lp_token();
      const tokenContract = new ethers.Contract(lpTokenAddress, poolsABI, provider);
      const poolName = await tokenContract.name();
      return poolName;
    } catch (error) {
      console.error(`Error fetching pool name for address ${address}:`, error);
      return "Unknown Pool";
    }
  }

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
      const newPoolNames = {};

      for (const address of result) {
        const poolName = await fetchPoolName(address);
        newPoolNames[address] = poolName;
      }

      setPoolNames(newPoolNames);

      result.forEach((address) => {
        getAccountInfoForAddress(address);
      });
    } catch (error) {
      console.error("Error:", error);
    }
  }

  async function getInjectTokenBalanceForAddress() {
    const injectTokenAddress = await contract.getInjectTokenAddress();
    setInjectTokenAddress(injectTokenAddress);
    const tokenContract = new ethers.Contract(injectTokenAddress, ERC20, provider);
    const balanceForAddress = await tokenContract.balanceOf(contractAddress);
    const decimals = tokenDecimals[injectTokenAddress.toLowerCase()] || 18;
    setContractBalance(ethers.utils.formatUnits(balanceForAddress, decimals));
  }

  const handleAddressSelect = (event) => {
    const fullSelection = event.target.value;
    setDropdownSelection(fullSelection);

    const [network, address] = fullSelection.split("-");
    setSelectedNetwork(network);

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
    if (urlNetwork && urlAddress) {
      const selectionValue = `${urlNetwork}-${urlAddress}`;
      setDropdownSelection(selectionValue);
      handleAddressSelect({ target: { value: selectionValue } });
    }
    // eslint-disable-next-line
  }, [urlNetwork, urlAddress]);

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
    // eslint-disable-next-line
  }, [contractAddress, selectedNetwork]);

  function formatTokenAmount(amount, tokenAddress) {
    if (amount === null || amount === undefined) return "Loading...";

    const formattedAmount = ethers.BigNumber.isBigNumber(amount) ? amount : ethers.BigNumber.from(amount.toString());
    const decimals = tokenDecimals[tokenAddress.toLowerCase()] || 18;

    return ethers.utils.formatUnits(formattedAmount, decimals);
  }

  const totalProduct = addresses.reduce((sum, address) => {
    const amountPerPeriod = accountInfo[address]?.amountPerPeriod || 0;
    const maxPeriods = accountInfo[address]?.maxPeriods || 0;
    const formattedAmountPerPeriod = parseFloat(formatTokenAmount(amountPerPeriod, injectTokenAddress));
    return sum + formattedAmountPerPeriod * maxPeriods;
  }, 0);

  const totalAmountDistributed = addresses.reduce((sum, address) => {
    const amountPerPeriod = accountInfo[address]?.amountPerPeriod || 0;
    const periodNumber = accountInfo[address]?.periodNumber || 0;
    const formattedAmountPerPeriod = parseFloat(formatTokenAmount(amountPerPeriod, injectTokenAddress));
    return sum + formattedAmountPerPeriod * periodNumber;
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
        {contractAddress && addresses.length > 0 ? (
          <table className="bordered-table">
            <thead>
              <tr>
                <th>Address</th>
                <th>Pool Name</th>
                <th>Amount Per Period</th>
                <th>Is Active</th>
                <th>Max Periods</th>
                <th>Period Number</th>
                <th>Last Injection Timestamp</th>
                <th>Last Injection Date</th>
                <th>Next Injection Date</th>
                <th>Program End Date</th>
              </tr>
            </thead>
            <tbody>
              {addresses.map((address, index) => (
                <tr key={index}>
                  <td>{address}</td>
                  <td>{poolNames[address] || "Loading..."}</td>
                  <td>{formatTokenAmount(accountInfo[address]?.amountPerPeriod, injectTokenAddress)}</td>
                  <td>{accountInfo[address]?.isActive.toString() || "Loading..."}</td>
                  <td>{accountInfo[address]?.maxPeriods.toString() || "Loading..."}</td>
                  <td>{accountInfo[address]?.periodNumber.toString() || "Loading..."}</td>
                  <td>{accountInfo[address]?.lastInjectionTimeStamp.toString() || "Loading..."}</td>
                  <td>{accountInfo[address]?.lastInjectionTimeStamp ? new Date(accountInfo[address]?.lastInjectionTimeStamp * 1000).toLocaleDateString() : "Loading..."}</td>
                  <td>
                    {accountInfo[address]?.isActive && accountInfo[address]?.periodNumber < accountInfo[address]?.maxPeriods
                      ? new Date(accountInfo[address]?.lastInjectionTimeStamp * 1000 + 7 * 24 * 3600 * 1000).toLocaleDateString()
                      : "N/A"}
                  </td>
                  <td>
                    {accountInfo[address]?.isActive && accountInfo[address]?.periodNumber < accountInfo[address]?.maxPeriods
                      ? new Date(
                          accountInfo[address]?.lastInjectionTimeStamp * 1000 + 7 * (accountInfo[address]?.maxPeriods - accountInfo[address]?.periodNumber + 1) * 24 * 3600 * 1000
                        ).toLocaleDateString()
                      : "N/A"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No addresses found in the watchlist.</p>
        )}
        <p>Total Amount to be Distributed: {totalProduct}</p>
        <br />
        <p>Total Amount Distributed: {totalAmountDistributed}</p>
        <br />
        <p>Remaining Inject Token: {contractBalance}</p>
      </main>
    </div>
  );
}

export default App;
