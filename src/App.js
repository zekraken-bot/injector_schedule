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
  const [contractBalance, setContractBalance] = useState(0);
  const [contractAddress, setContractAddress] = useState("");
  const [jsonAddresses, setJsonAddresses] = useState([]);
  const [dropdownSelection, setDropdownSelection] = useState("");
  const [selectedNetwork, setSelectedNetwork] = useState("");
  const [injectTokenAddress, setInjectTokenAddress] = useState("");
  const [poolNames, setPoolNames] = useState({});
  const [periodFinishTimestamps, setPeriodFinishTimestamps] = useState({});
  const [isEditMode, setIsEditMode] = useState(false);
  const [editableData, setEditableData] = useState({});
  const [generatedJson, setGeneratedJson] = useState(null);

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
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 6, // base
    "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca": 6, // base USDbC
    "0x0b2c639c533813f4aa9d7837caf62653d097ff85": 6, // OP USDC
  };

  const networkChoice = {
    mainnet: "https://ethereum.publicnode.com",
    polygon: "https://polygon.llamarpc.com",
    arbitrum: "https://arb1.arbitrum.io/rpc",
    gnosis: "https://rpc.gnosischain.com",
    zkevm: "https://zkevm-rpc.com",
    avalanche: "https://avalanche.public-rpc.com",
    base: "https://developer-access-mainnet.base.org",
    optimism: " https://mainnet.optimism.io",
  };

  const chainIds = {
    mainnet: "1",
    polygon: "137",
    arbitrum: "42161",
    gnosis: "100",
    zkevm: "1101",
    avalanche: "43114",
    base: "8453",
    optimism: "10",
  };

  const [provider, setProvider] = useState(new ethers.providers.JsonRpcProvider(networkChoice.mainnet));
  const [contract, setContract] = useState(new ethers.Contract(contractAddress, InjectorABI, provider));

  async function fetchPeriodFinish(address) {
    try {
      const gaugeContract = new ethers.Contract(address, gaugeABI, provider);
      const rewardData = await gaugeContract.reward_data(injectTokenAddress);
      const periodFinish = rewardData.period_finish;
      return periodFinish;
    } catch (error) {
      console.error(`Error fetching period finish for address ${address}:`, error);
      return 0;
    }
  }

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
      const formattedAmountPerPeriod = formatTokenAmount(result.amountPerPeriod, injectTokenAddress);

      setAccountInfo((prevInfo) => ({ ...prevInfo, [address]: result }));

      const periodFinish = await fetchPeriodFinish(address);
      setPeriodFinishTimestamps((prevTimestamps) => ({ ...prevTimestamps, [address]: periodFinish }));

      setEditableData((prevData) => ({
        ...prevData,
        [address]: {
          ...prevData[address],
          address: address,
          amountPerPeriod: formattedAmountPerPeriod,
          maxPeriods: result.maxPeriods.toString(),
        },
      }));
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

      setGeneratedJson(null);
      setEditableData({});
    }
  };

  function updateEditableData(rowId, field, value) {
    setEditableData((prevData) => ({
      ...prevData,
      [rowId]: {
        ...prevData[rowId],
        [field]: field === "maxPeriods" ? parseInt(value) : value, // Ensure it's an integer for "maxPeriods"
      },
    }));
  }

  const handleAddRow = () => {
    const newRowId = `new-${Date.now()}`;
    setEditableData((prevData) => ({
      ...prevData,
      [newRowId]: {
        address: "",
        amountPerPeriod: "0",
        maxPeriods: "0",
      },
    }));
  };

  const handleDeleteRow = (address) => {
    setEditableData((prevData) => {
      const newData = { ...prevData };
      delete newData[address];
      return newData;
    });
  };

  function generateJsonOutput() {
    const gaugeAddresses = Object.entries(editableData)
      .map(([rowId, data]) => {
        return rowId.startsWith("new-") ? data.address : rowId;
      })
      .filter((address) => address); // Filter out empty or invalid addresses

    const amountsPerPeriod = gaugeAddresses.map((address) => {
      return convertToBaseUnit(editableData[address].amountPerPeriod, injectTokenAddress);
    });
    const maxPeriods = gaugeAddresses.map((address) => editableData[address].maxPeriods);
    const currentChainId = chainIds[selectedNetwork];

    const jsonData = {
      version: "1.0",
      chainId: currentChainId,
      createdAt: Date.now(),
      meta: {
        name: "Transactions Batch",
        description: "Child Chain Injector Program Load",
        txBuilderVersion: "1.16.3",
      },
      transactions: [
        {
          to: contractAddress,
          value: "0",
          data: null,
          contractMethod: {
            inputs: [
              {
                name: "gaugeAddresses",
                type: "address[]",
                internalType: "address[]",
              },
              {
                name: "amountsPerPeriod",
                type: "uint256[]",
                internalType: "uint256[]",
              },
              {
                name: "maxPeriods",
                type: "uint8[]",
                internalType: "uint8[]",
              },
            ],
            name: "setRecipientList",
            payable: false,
          },
          contractInputsValues: {
            gaugeAddresses: `["${gaugeAddresses.join('","')}"]`,
            amountsPerPeriod: `["${amountsPerPeriod.join('","')}"]`,
            maxPeriods: `["${maxPeriods.join('","')}"]`,
          },
        },
      ],
    };

    setGeneratedJson(JSON.stringify(jsonData, null, 2));
  }

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
  }, [contractAddress, selectedNetwork, injectTokenAddress]);

  useEffect(() => {
    if (!isEditMode && Object.keys(editableData).length > 0) {
      generateJsonOutput();
    }

    // eslint-disable-next-line
  }, [isEditMode, editableData]);

  function formatTokenAmount(amount, tokenAddress) {
    if (amount === null || amount === undefined) return "Loading...";

    const formattedAmount = ethers.BigNumber.isBigNumber(amount) ? amount : ethers.BigNumber.from(amount.toString());
    const decimals = tokenDecimals[tokenAddress.toLowerCase()] || 18;

    return ethers.utils.formatUnits(formattedAmount, decimals);
  }

  function convertToBaseUnit(amount, tokenAddress) {
    const decimals = tokenDecimals[tokenAddress.toLowerCase()] || 18;
    const roundedAmount = Number(amount).toFixed(decimals);
    return ethers.utils.parseUnits(roundedAmount, decimals).toString();
  }

  function downloadJsonFile() {
    const blob = new Blob([generatedJson], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "data.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  const totalAmountRemaining = addresses.reduce((sum, address) => {
    return totalProduct - totalAmountDistributed;
  }, 0);

  const additionalTokensRequired = totalAmountRemaining > contractBalance ? totalAmountRemaining - contractBalance : 0;

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
          {"\u00A0\u00A0\u00A0"}
          <button onClick={() => setIsEditMode(!isEditMode)}>{isEditMode ? "Save" : "Edit"}</button>
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
                <th>Last Injection Date</th>
                <th>Next Injection Date</th>
                <th>Program End Date</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(editableData).map(([rowId, data], index) => (
                <tr key={rowId}>
                  <td>
                    {rowId.startsWith("new-") ? (
                      isEditMode ? (
                        <input type="text" size="45" value={data.address} onChange={(e) => updateEditableData(rowId, "address", e.target.value)} />
                      ) : (
                        data.address
                      )
                    ) : (
                      rowId
                    )}
                  </td>
                  <td>{isEditMode && rowId.startsWith("new-") ? data.poolName : poolNames[rowId]}</td>
                  <td>
                    {isEditMode ? (
                      <input type="number" value={data.amountPerPeriod} onChange={(e) => updateEditableData(rowId, "amountPerPeriod", e.target.value)} />
                    ) : (
                      data.amountPerPeriod
                    )}
                  </td>
                  <td>{accountInfo[rowId]?.isActive.toString()}</td>
                  <td>
                    {isEditMode ? <input type="number" value={data.maxPeriods} onChange={(e) => updateEditableData(rowId, "maxPeriods", e.target.value)} /> : data.maxPeriods}
                  </td>
                  <td>{isEditMode ? "0" : accountInfo[rowId]?.periodNumber.toString()}</td>
                  <td>
                    {accountInfo[rowId]?.lastInjectionTimeStamp > 0
                      ? new Date(accountInfo[rowId]?.lastInjectionTimeStamp * 1000).toLocaleDateString()
                      : periodFinishTimestamps[rowId]
                      ? new Date(periodFinishTimestamps[rowId] * 1000).toLocaleDateString()
                      : "N/A"}
                  </td>
                  <td>
                    {accountInfo[rowId]?.isActive && accountInfo[rowId]?.periodNumber < accountInfo[rowId]?.maxPeriods
                      ? new Date(
                          (accountInfo[rowId]?.lastInjectionTimeStamp > 0 ? accountInfo[rowId]?.lastInjectionTimeStamp : periodFinishTimestamps[rowId]) * 1000 +
                            7 * 24 * 3600 * 1000
                        ).toLocaleDateString()
                      : "N/A"}
                  </td>
                  <td>
                    {accountInfo[rowId]?.isActive && accountInfo[rowId]?.periodNumber < accountInfo[rowId]?.maxPeriods
                      ? new Date(
                          (accountInfo[rowId]?.lastInjectionTimeStamp > 0 ? accountInfo[rowId]?.lastInjectionTimeStamp : periodFinishTimestamps[rowId]) * 1000 +
                            7 * (accountInfo[rowId]?.maxPeriods - accountInfo[rowId]?.periodNumber + 1) * 24 * 3600 * 1000
                        ).toLocaleDateString()
                      : "N/A"}
                  </td>
                  {isEditMode && (
                    <td>
                      <button onClick={() => handleDeleteRow(rowId)}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No addresses found in the watchlist.</p>
        )}
        {isEditMode && <button onClick={handleAddRow}>Add Row</button>}
        <br />
        <p>Total amount to be distributed in program: {totalProduct}</p>
        <br />
        <p>Total amount distributed thus far: {totalAmountDistributed}</p>
        <br />
        <p>Remaining amount to be distributed: {totalAmountRemaining}</p>
        <br />
        <p>Remaining amount of inject token: {contractBalance}</p>
        <br />
        {additionalTokensRequired > 0 && (
          <div className="warning">
            <p>
              Warning: This program needs an additional {additionalTokensRequired} tokens to run to completion. They can be transferred here: [{selectedNetwork}:{contractAddress}]
            </p>
            <br />
          </div>
        )}
        <p>
          A direct link to this page:{"\u00A0\u00A0"}
          <a href={`https://injector-schedule.web.app/${selectedNetwork}/${contractAddress}`} target="_self">
            https://injector-schedule.web.app/{selectedNetwork}/{contractAddress}
          </a>
        </p>
        <button onClick={downloadJsonFile} disabled={!generatedJson}>
          Download JSON
        </button>
        <br />
        {/*{generatedJson && <pre>{generatedJson}</pre>}*/}
        <br />
        <br />
      </main>
      <footer className="footer">
        created by&nbsp;
        <a href="https://twitter.com/The_Krake" target="_blank" rel="noopener noreferrer">
          @ZeKraken
        </a>
        &nbsp;| open source: &nbsp;
        <a href="https://github.com/zekraken-bot/injector_schedule" target="_blank" rel="noopener noreferrer">
          github
        </a>
        &nbsp;|&nbsp;Disclaimer: use at your discretion, I take no responsiblity for results
      </footer>
      <br />
    </div>
  );
}

export default App;
