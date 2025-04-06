import { useEffect, useState } from 'react';
import Head from 'next/head';
import Button from '../components/ui/button';
import styles from '../styles/DisperseUI.module.css';
import { ethers } from 'ethers';

const CONTRACT_ADDRESS = '0x59b990c626853DC951A38EFC1dF50abb4d48Ca75';
const AVG_TOKEN_ADDRESS = '0xa41F142b6eb2b164f8164CAE0716892Ce02f311f';
const BSC_MAINNET_CHAIN_ID = '0x38';

const CONTRACT_ABI = [
  "function disperseBNB(address[] calldata recipients, uint256[] calldata amounts) external payable",
  "function disperseToken(address token, address[] calldata recipients, uint256[] calldata amounts) external"
];

const TOKEN_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address owner) external view returns (uint256)"
];

export default function Home() {
  const [walletAddress, setWalletAddress] = useState('');
  const [mode, setMode] = useState('');
  const [inputText, setInputText] = useState('');
  const [approved, setApproved] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const [previewTotal, setPreviewTotal] = useState('0');
  const [recipientCount, setRecipientCount] = useState(0);
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [tokenBalance, setTokenBalance] = useState('');
  const [isLoadingToken, setIsLoadingToken] = useState(false);

  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);

  const connectWallet = async () => {
    if (!window.ethereum) return alert("Please install MetaMask");
    const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
    await web3Provider.send("eth_requestAccounts", []);
    const signer = web3Provider.getSigner();
    const address = await signer.getAddress();
    setWalletAddress(address);
    setProvider(web3Provider);
    setSigner(signer);
    setContract(new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer));

    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (chainId !== BSC_MAINNET_CHAIN_ID) {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: BSC_MAINNET_CHAIN_ID }]
        });
      } catch {
        alert("Please switch to BNB Chain manually.");
      }
    }
  };

  const disconnectWallet = () => {
    setWalletAddress('');
    setSigner(null);
    setProvider(null);
    setContract(null);
  };

  const parseInput = () => {
    const lines = inputText.trim().split('\n');
    const recipients = [];
    const amounts = [];

    for (const line of lines) {
      const [address, amount] = line.split(/[, =]+/);
      if (ethers.utils.isAddress(address) && !isNaN(parseFloat(amount))) {
        recipients.push(address);
        amounts.push(ethers.utils.parseUnits(amount.trim(), 18));
      }
    }

    setRecipientCount(recipients.length);
    const total = amounts.reduce((sum, val) => sum.add(val), ethers.BigNumber.from(0));
    setPreviewTotal(ethers.utils.formatUnits(total, 18));
    return { recipients, amounts, total };
  };

  const checkApproval = async () => {
    if (!walletAddress || !signer || !tokenAddress) return;
    const token = new ethers.Contract(tokenAddress, TOKEN_ABI, signer);
    const allowance = await token.allowance(walletAddress, CONTRACT_ADDRESS);
    setApproved(allowance.gt(0));
  };

  const fetchBalance = async () => {
    if (!walletAddress || !signer) return;
    if (mode === 'bnb') {
      const bal = await provider.getBalance(walletAddress);
      setTokenSymbol('BNB');
      setTokenBalance(ethers.utils.formatEther(bal));
    } else if (tokenAddress) {
      const token = new ethers.Contract(tokenAddress, TOKEN_ABI, signer);
      const bal = await token.balanceOf(walletAddress);
      const decimals = await token.decimals();
      const symbol = await token.symbol();
      setTokenSymbol(symbol);
      setTokenBalance(ethers.utils.formatUnits(bal, decimals));
    }
  };

  const loadCustomToken = async () => {
    if (!signer || !tokenAddress) return;
    setIsLoadingToken(true);
    try {
      const token = new ethers.Contract(tokenAddress, TOKEN_ABI, signer);
      const symbol = await token.symbol();
      setTokenSymbol(symbol);
      await fetchBalance();
      await checkApproval();
    } catch {
      alert("Invalid token contract.");
      setTokenSymbol('');
    }
    setIsLoadingToken(false);
  };

  const approveToken = async () => {
    const { total } = parseInput();
    const token = new ethers.Contract(tokenAddress, TOKEN_ABI, signer);
    const tx = await token.approve(CONTRACT_ADDRESS, ethers.constants.MaxUint256);
    await tx.wait();
    checkApproval();
  };

  const revokeToken = async () => {
    const token = new ethers.Contract(tokenAddress, TOKEN_ABI, signer);
    const tx = await token.approve(CONTRACT_ADDRESS, 0);
    await tx.wait();
    checkApproval();
  };

  const sendDisperse = async () => {
    const { recipients, amounts, total } = parseInput();
    if (!recipients.length) return alert("Invalid input");
    let tx;
    if (mode === 'bnb') {
      tx = await contract.disperseBNB(recipients, amounts, { value: total });
    } else {
      tx = await contract.disperseToken(tokenAddress, recipients, amounts);
    }
    await tx.wait();
    setTxHash(tx.hash);
    checkApproval();
  };

  useEffect(() => {
    if (walletAddress) fetchBalance();
  }, [walletAddress, mode, tokenAddress]);

  useEffect(() => {
    if (mode && walletAddress && inputText) parseInput();
  }, [inputText]);

  return (
    <div className={styles.fullPage}>
      <Head>
        <title>Avocado Disperser</title>
        <link rel="icon" href="https://www.avocadodao.io/favicon/favicon.ico" />
      </Head>
      <div className={styles.container}>
        <img
          src="https://www.avocadodao.io/favicon/apple-touch-icon.png"
          alt="Avocado Logo"
          style={{ width: '160px', display: 'block', margin: '0 auto 1rem' }}
        />
        <h1 className={styles.title}>Avocado Disperser</h1>

        {!walletAddress ? (
          <Button onClick={connectWallet}>Connect Wallet</Button>
        ) : (
          <>
            <div className={styles.connected}>
              Connected: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              <span className={styles.disconnect} onClick={disconnectWallet}>Disconnect</span>
            </div>

            <div className={styles.tooltipWrapper}>
              <label className={styles.tooltipLabel}>
                Select Token
                <span className={styles.tooltip}>
                  Choose a token to send. BNB is native. AVG is your in-house token. Custom lets you paste a contract.
                </span>
              </label>
              <select className={styles.select} onChange={(e) => {
                const value = e.target.value;
                setMode(value);
                setInputText('');
                setPreviewTotal('0');
                setRecipientCount(0);
                setApproved(false);
                setTokenBalance('');
                setTokenSymbol('');
                setTokenAddress(value === 'avg' ? AVG_TOKEN_ADDRESS : '');
                if (value === 'bnb') {
                  setTokenSymbol('BNB');
                }
              }}>
                <option value="">Select Token</option>
                <option value="bnb">BNB</option>
                <option value="avg">$AVG</option>
                <option value="custom">Custom Token</option>
              </select>
            </div>

            {mode === 'custom' && (
              <>
                <div className={styles.tooltipWrapper}>
                  <label className={styles.tooltipLabel}>
                    Token Contract Address
                    <span className={styles.tooltip}>
                      Paste a valid BSC contract address to load your custom token.
                    </span>
                  </label>
                  <input
                    className={styles.select}
                    placeholder="Paste token contract address"
                    onChange={(e) => setTokenAddress(e.target.value)}
                  />
                </div>
                <Button onClick={loadCustomToken}>
                  {isLoadingToken ? 'Loading...' : 'Load Token'}
                </Button>
              </>
            )}

            {tokenBalance && tokenSymbol && (
              <div className={styles.preview}>
                Balance: {tokenBalance} {tokenSymbol}
              </div>
            )}

            {mode && (
              <>
                <div className={styles.tooltipWrapper}>
                  <label className={styles.tooltipLabel}>
                    recipients and amounts
                    <span className={styles.tooltip}>
                      Enter one address and amount in BNB or token per line. Supports comma, space, or equals sign.
                      <br /><br />
                      <code>0xabc..., 1.23</code><br />
                      <code>0xabc... 1.23</code><br />
                      <code>0xabc... = 1.23</code>
                    </span>
                  </label>
                  <textarea
                    className={styles.textarea}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={`0xabc..., 1.23\n0xabc... 1.23\n0xabc... = 1.23`}
                  />
                </div>

                {previewTotal !== '0' && (
                  <div className={styles.preview}>
                    Total: {previewTotal} {tokenSymbol} | Recipients: {recipientCount}
                  </div>
                )}

                {tokenAddress && mode !== 'bnb' && !approved && (
                  <div className={styles.tooltipWrapper}>
                    <Button onClick={approveToken}>Approve</Button>
                    <div className={styles.tooltip}>Approve token for sending. Required before dispersing.</div>
                  </div>
                )}

                {tokenAddress && mode !== 'bnb' && approved && (
                  <>
                    <div className={styles.tooltipWrapper}>
                      <Button onClick={revokeToken}>Revoke</Button>
                      <div className={styles.tooltip}>Remove token approval.</div>
                    </div>
                    <div className={styles.tooltipWrapper}>
                      <Button onClick={sendDisperse}>Send</Button>
                      <div className={styles.tooltip}>Send selected token to all listed recipients.</div>
                    </div>
                  </>
                )}

                {mode === 'bnb' && (
                  <div className={styles.tooltipWrapper}>
                    <Button onClick={sendDisperse}>Send</Button>
                    <div className={styles.tooltip}>Send BNB to all recipients.</div>
                  </div>
                )}

                {txHash && (
                  <div className={styles.txinfo}>
                    ✅ Success: <a href={`https://bscscan.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer">{txHash.slice(0, 10)}...</a>
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
