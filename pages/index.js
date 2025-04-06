import { useEffect, useState } from 'react';
import Button from '../components/ui/button';
import styles from '../styles/DisperseUI.module.css';
import { ethers } from 'ethers';

const CONTRACT_ADDRESS = '0x59b990c626853DC951A38EFC1dF50abb4d48Ca75';
const AVG_TOKEN_ADDRESS = '0xa41F142b6eb2b164f8164CAE0716892Ce02f311f';

const CONTRACT_ABI = [
  "function disperseBNB(address[] calldata recipients, uint256[] calldata amounts) external payable",
  "function disperseToken(address token, address[] calldata recipients, uint256[] calldata amounts) external"
];

export default function Home() {
  const [walletAddress, setWalletAddress] = useState('');
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [mode, setMode] = useState('');
  const [inputText, setInputText] = useState('');
  const [approved, setApproved] = useState(false);

  const [customTokenAddress, setCustomTokenAddress] = useState('');
  const [customToken, setCustomToken] = useState(null);
  const [customSymbol, setCustomSymbol] = useState('');
  const [customDecimals, setCustomDecimals] = useState(18);
  const [customBalance, setCustomBalance] = useState('0');
  const [tokenLogo, setTokenLogo] = useState('');

  useEffect(() => {
    if (mode !== 'custom') {
      setCustomTokenAddress('');
      setCustomSymbol('');
      setCustomBalance('');
      setTokenLogo('');
      setApproved(false);
    }
  }, [mode]);

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask.");
      return;
    }
    const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
    await web3Provider.send("eth_requestAccounts", []);
    const signer = web3Provider.getSigner();
    const address = await signer.getAddress();

    setWalletAddress(address);
    setProvider(web3Provider);
    setSigner(signer);
    setContract(new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer));
  };

  const parseInput = () => {
    const lines = inputText.trim().split('\n');
    const recipients = [];
    const amounts = [];

    for (const line of lines) {
      const [address, amount] = line.split(/[, ]+/);
      if (ethers.utils.isAddress(address) && !isNaN(parseFloat(amount))) {
        recipients.push(address);
        const decimals = mode === 'custom' ? customDecimals : 18;
        amounts.push(ethers.utils.parseUnits(amount.trim(), decimals));
      }
    }
    return { recipients, amounts };
  };

  const loadCustomToken = async () => {
    try {
      const token = new ethers.Contract(customTokenAddress, [
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
        "function balanceOf(address) view returns (uint)",
        "function approve(address,uint) returns (bool)"
      ], signer);

      const symbol = await token.symbol();
      const decimals = await token.decimals();
      const balance = await token.balanceOf(walletAddress);

      setCustomToken(token);
      setCustomSymbol(symbol);
      setCustomDecimals(decimals);
      setCustomBalance(ethers.utils.formatUnits(balance, decimals));
      setApproved(false);

      const logoURL = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets/${customTokenAddress}/logo.png`;
      setTokenLogo(logoURL);
    } catch (err) {
      alert("Failed to load token info. Please check address.");
      console.error(err);
    }
  };

  const approveToken = async () => {
    const { amounts } = parseInput();
    const total = amounts.reduce((sum, a) => sum.add(a), ethers.BigNumber.from(0));

    const token = mode === 'avg'
      ? new ethers.Contract(AVG_TOKEN_ADDRESS, ["function approve(address,uint) returns (bool)"], signer)
      : customToken;

    const tx = await token.approve(CONTRACT_ADDRESS, ethers.constants.MaxUint256);
    await tx.wait();
    alert("Approval successful");
    setApproved(true);
  };

  const sendDisperse = async () => {
    const { recipients, amounts } = parseInput();
    if (!recipients.length) return alert("No valid recipients found.");

    if (mode === 'bnb') {
      const total = amounts.reduce((sum, a) => sum.add(a), ethers.BigNumber.from(0));
      const tx = await contract.disperseBNB(recipients, amounts, { value: total });
      await tx.wait();
      alert("BNB sent!");
    } else {
      const tokenAddress = mode === 'avg' ? AVG_TOKEN_ADDRESS : customTokenAddress;
      const tx = await contract.disperseToken(tokenAddress, recipients, amounts);
      await tx.wait();
      alert("Token sent!");
    }
  };

  return (
    <div className={styles.container}>
      <h1>BNB / $AVG / Custom Disperse</h1>
      {!walletAddress ? (
        <Button onClick={connectWallet}>Connect Wallet</Button>
      ) : (
        <>
          <p>Connected: {walletAddress}</p>

          <select onChange={(e) => setMode(e.target.value)}>
            <option value="">Select Token</option>
            <option value="bnb">BNB</option>
            <option value="avg">AVG Token</option>
            <option value="custom">Custom Token</option>
          </select>

          {mode === 'custom' && (
            <>
              <input
                placeholder="Enter custom token address"
                value={customTokenAddress}
                onChange={(e) => setCustomTokenAddress(e.target.value)}
              />
              <Button onClick={loadCustomToken}>Load Token</Button>
              {customSymbol && (
                <>
                  <p>Symbol: {customSymbol}</p>
                  <p>Balance: {customBalance}</p>
                  {tokenLogo && (
                    <img src={tokenLogo} alt="token logo" width="40" height="40" onError={(e) => e.target.style.display = 'none'} />
                  )}
                </>
              )}
            </>
          )}

          {(mode === 'bnb' || mode === 'avg' || (mode === 'custom' && customSymbol)) && (
            <>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="0xAddress, 1.23"
                rows={8}
              />
              {(mode === 'bnb' || approved) ? (
                <Button onClick={sendDisperse}>Send</Button>
              ) : (
                <Button onClick={approveToken}>Approve</Button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
