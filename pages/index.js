import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import Head from 'next/head';
import Button from '../components/ui/button';
import styles from '../styles/DisperseUI.module.css';

const CONTRACT_ADDRESS = '0x59b990c626853DC951A38EFC1dF50abb4d48Ca75';
const AVG_TOKEN_ADDRESS = '0xa41F142b6eb2b164f8164CAE0716892Ce02f311f';
const BSC_CHAIN_ID = '0x38';

const CONTRACT_ABI = [
  "function disperseBNB(address[] calldata recipients, uint256[] calldata amounts) external payable",
  "function disperseToken(address token, address[] calldata recipients, uint256[] calldata amounts) external"
];

const TOKEN_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address account) external view returns (uint256)"
];

export default function Home() {
  const [walletAddress, setWalletAddress] = useState('');
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [bnbBalance, setBnbBalance] = useState('');
  const [tokenBalance, setTokenBalance] = useState('');
  const [symbol, setSymbol] = useState('');

  const [mode, setMode] = useState('');
  const [inputText, setInputText] = useState('');
  const [parsedTotal, setParsedTotal] = useState(ethers.BigNumber.from(0));
  const [recipientCount, setRecipientCount] = useState(0);
  const [approved, setApproved] = useState(false);
  const [txHash, setTxHash] = useState(null);

  const [customTokenAddress, setCustomTokenAddress] = useState('');
  const [loadingToken, setLoadingToken] = useState(false);

  const connectWallet = async () => {
    if (!window.ethereum) return alert('Please install MetaMask');

    const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
    await web3Provider.send('eth_requestAccounts', []);
    const network = await web3Provider.getNetwork();
    if (network.chainId !== parseInt(BSC_CHAIN_ID, 16)) {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: BSC_CHAIN_ID }]
        });
      } catch (switchError) {
        return alert('Please switch to BNB Chain manually in MetaMask.');
      }
    }

    const signer = web3Provider.getSigner();
    const address = await signer.getAddress();
    const balance = await web3Provider.getBalance(address);

    setWalletAddress(address);
    setProvider(web3Provider);
    setSigner(signer);
    setBnbBalance(ethers.utils.formatEther(balance));
    setContract(new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer));
  };

  const disconnectWallet = () => {
    setWalletAddress('');
    setSigner(null);
    setProvider(null);
    setContract(null);
    setApproved(false);
  };

  const parseInput = () => {
    const lines = inputText.trim().split('\n');
    const recipients = [];
    const amounts = [];

    for (const line of lines) {
      const [address, amount] = line.split(/[, ]+/);
      if (ethers.utils.isAddress(address) && !isNaN(parseFloat(amount))) {
        recipients.push(address);
        amounts.push(ethers.utils.parseUnits(amount.trim(), 18));
      }
    }

    const total = amounts.reduce((sum, val) => sum.add(val), ethers.BigNumber.from(0));
    setParsedTotal(total);
    setRecipientCount(recipients.length);
    return { recipients, amounts, total };
  };

  const checkApproval = async () => {
    if (!walletAddress || !signer || parsedTotal.isZero()) return;

    const tokenAddress = mode === 'avg' ? AVG_TOKEN_ADDRESS : customTokenAddress;
    const token = new ethers.Contract(tokenAddress, TOKEN_ABI, signer);
    const allowance = await token.allowance(walletAddress, CONTRACT_ADDRESS);
    setApproved(allowance.gte(parsedTotal));
  };

  const approve = async () => {
    const tokenAddress = mode === 'avg' ? AVG_TOKEN_ADDRESS : customTokenAddress;
    const token = new ethers.Contract(tokenAddress, TOKEN_ABI, signer);
    const tx = await token.approve(CONTRACT_ADDRESS, ethers.constants.MaxUint256);
    await tx.wait();
    await checkApproval(); // re-check after approve
  };

  const revoke = async () => {
    const tokenAddress = mode === 'avg' ? AVG_TOKEN_ADDRESS : customTokenAddress;
    const token = new ethers.Contract(tokenAddress, TOKEN_ABI, signer);
    const tx = await token.approve(CONTRACT_ADDRESS, 0);
    await tx.wait();
    await checkApproval(); // re-check after revoke
  };

  const sendDisperse = async () => {
    const { recipients, amounts, total } = parseInput();
    const tokenAddress = mode === 'avg' ? AVG_TOKEN_ADDRESS : customTokenAddress;

    let tx;
    if (mode === 'bnb') {
      tx = await contract.disperseBNB(recipients, amounts, { value: total });
    } else {
      tx = await contract.disperseToken(tokenAddress, recipients, amounts);
    }

    await tx.wait();
    setTxHash(tx.hash);
  };

  const loadCustomToken = async () => {
    try {
      setLoadingToken(true);
      const token = new ethers.Contract(customTokenAddress, TOKEN_ABI, signer);
      const userBalance = await token.balanceOf(walletAddress);
      const tokenSymbol = await token.symbol();
      setSymbol(tokenSymbol);
      setTokenBalance(ethers.utils.formatUnits(userBalance, 18));
    } catch (err) {
      alert('Error loading token. Please verify address.');
    } finally {
      setLoadingToken(false);
    }
  };

  useEffect(() => {
    if (mode === 'avg' || mode === 'custom') checkApproval();
  }, [inputText, customTokenAddress, parsedTotal]);

  return (
    <div className={styles.fullPage}>
      <Head>
        <title>Avocado Disperser</title>
        <link rel="icon" href="https://www.avocadodao.io/favicon/favicon.ico" />
      </Head>

      <div className={styles.container}>
        <img src="https://www.avocadodao.io/images/avocado-logo.svg" alt="Avocado DAO" style={{ maxWidth: '200px', display: 'block', margin: '0 auto 1rem' }} />
        <h1 className={styles.title}>Avocado Disperser</h1>

        {!walletAddress ? (
          <Button onClick={connectWallet}>Connect Wallet</Button>
        ) : (
          <>
            <div className={styles.connected}>
              Connected: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              <span className={styles.disconnect} onClick={disconnectWallet}>Disconnect</span>
            </div>

            <select className={styles.select} value={mode} onChange={(e) => {
              setMode(e.target.value);
              setInputText('');
              setParsedTotal(ethers.BigNumber.from(0));
              setRecipientCount(0);
              setApproved(false);
              setTxHash(null);
              setTokenBalance('');
              setSymbol('');
            }}>
              <option value="">Select Token</option>
              <option value="bnb">BNB (Balance: {bnbBalance})</option>
              <option value="avg">AVG</option>
              <option value="custom">Custom Token</option>
            </select>

            {mode === 'custom' && (
              <>
                <input
                  className={styles.select}
                  placeholder="Paste custom token address"
                  value={customTokenAddress}
                  onChange={(e) => setCustomTokenAddress(e.target.value)}
                />
                <Button onClick={loadCustomToken}>Load</Button>
                {loadingToken && <div className={styles.preview}>🔄 Loading...</div>}
                {symbol && (
                  <div className={styles.preview}>
                    {symbol} Balance: {tokenBalance}
                  </div>
                )}
              </>
            )}

            {mode && (
              <>
                <textarea
                  className={styles.textarea}
                  placeholder="0xAddress, 1.23"
                  value={inputText}
                  onChange={(e) => {
                    setInputText(e.target.value);
                    parseInput();
                  }}
                />
                {recipientCount > 0 && (
                  <div className={styles.preview}>
                    Recipients: {recipientCount}<br />
                    Total: {ethers.utils.formatUnits(parsedTotal, 18)} {symbol || mode.toUpperCase()}
                  </div>
                )}

                {(mode === 'avg' || mode === 'custom') && !approved && (
                  <Button onClick={approve}>Approve</Button>
                )}
                {(mode === 'avg' || mode === 'custom') && approved && (
                  <>
                    <Button onClick={revoke}>Revoke</Button>
                    <Button onClick={sendDisperse}>Send</Button>
                  </>
                )}
                {mode === 'bnb' && (
                  <Button onClick={sendDisperse}>Send</Button>
                )}

                {txHash && (
                  <div className={styles.txinfo}>
                    ✅ Success: <a href={`https://bscscan.com/tx/${txHash}`} target="_blank" rel="noreferrer">{txHash.slice(0, 12)}...</a>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
