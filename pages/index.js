import { useEffect, useState } from 'react';
import Button from '../components/ui/button';
import styles from '../styles/DisperseUI.module.css';
import { ethers } from 'ethers';

const CONTRACT_ADDRESS = '0x59b990c626853DC951A38EFC1dF50abb4d48Ca75';
const AVG_TOKEN_ADDRESS = '0xa41F142b6eb2b164f8164CAE0716892Ce02f311f';
const BSC_CHAIN_ID = '0x38';

const ABI = [
  "function disperseBNB(address[] calldata recipients, uint256[] calldata amounts) external payable",
  "function disperseToken(address token, address[] calldata recipients, uint256[] calldata amounts) external"
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

export default function Home() {
  const [wallet, setWallet] = useState('');
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [mode, setMode] = useState('');
  const [input, setInput] = useState('');
  const [approved, setApproved] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const [previewTotal, setPreviewTotal] = useState('0');
  const [recipientCount, setRecipientCount] = useState(0);
  const [customToken, setCustomToken] = useState('');
  const [customSymbol, setCustomSymbol] = useState('');
  const [customBalance, setCustomBalance] = useState('');
  const [checking, setChecking] = useState(false);

  const connect = async () => {
    if (!window.ethereum) return alert("Install MetaMask");
    const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
    await web3Provider.send("eth_requestAccounts", []);
    const signer = web3Provider.getSigner();
    const address = await signer.getAddress();
    setWallet(address);
    setSigner(signer);
    setProvider(web3Provider);
    setContract(new ethers.Contract(CONTRACT_ADDRESS, ABI, signer));

    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (chainId !== BSC_CHAIN_ID) {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: BSC_CHAIN_ID }]
        });
      } catch (e) {
        alert("Please switch to BNB Chain in MetaMask");
      }
    }
  };

  const disconnect = () => {
    setWallet('');
    setSigner(null);
    setProvider(null);
    setContract(null);
  };

  const parseInput = () => {
    const lines = input.trim().split('\n');
    const recipients = [];
    const amounts = [];

    for (let line of lines) {
      const [addr, amt] = line.split(/[,= ]+/);
      if (ethers.utils.isAddress(addr) && !isNaN(parseFloat(amt))) {
        recipients.push(addr);
        amounts.push(ethers.utils.parseUnits(amt.trim(), 18));
      }
    }

    setRecipientCount(recipients.length);
    const total = amounts.reduce((acc, n) => acc.add(n), ethers.BigNumber.from(0));
    setPreviewTotal(ethers.utils.formatUnits(total, 18));
    return { recipients, amounts, total };
  };

  const checkApproval = async () => {
    if (!signer || !wallet || !contract) return;
    const tokenAddr = mode === 'avg' ? AVG_TOKEN_ADDRESS : customToken;
    const token = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
    const allowance = await token.allowance(wallet, CONTRACT_ADDRESS);
    setApproved(allowance.gt(0));
  };

  const checkBalance = async () => {
    if (!signer || !wallet) return;
    if (mode === 'bnb') {
      const balance = await provider.getBalance(wallet);
      setCustomBalance(ethers.utils.formatEther(balance));
    } else {
      const tokenAddr = mode === 'avg' ? AVG_TOKEN_ADDRESS : customToken;
      const token = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
      const balance = await token.balanceOf(wallet);
      const symbol = await token.symbol();
      setCustomBalance(ethers.utils.formatUnits(balance, 18));
      setCustomSymbol(symbol);
    }
  };

  const loadCustomToken = async () => {
    try {
      setChecking(true);
      const token = new ethers.Contract(customToken, ERC20_ABI, signer);
      const sym = await token.symbol();
      const bal = await token.balanceOf(wallet);
      setCustomSymbol(sym);
      setCustomBalance(ethers.utils.formatUnits(bal, 18));
      await checkApproval();
    } catch (err) {
      alert("Invalid token contract");
      setCustomSymbol('');
      setCustomBalance('');
    } finally {
      setChecking(false);
    }
  };

  const approve = async () => {
    const { total } = parseInput();
    const tokenAddr = mode === 'avg' ? AVG_TOKEN_ADDRESS : customToken;
    const token = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
    const tx = await token.approve(CONTRACT_ADDRESS, ethers.constants.MaxUint256);
    await tx.wait();
    await checkApproval();
  };

  const revoke = async () => {
    const tokenAddr = mode === 'avg' ? AVG_TOKEN_ADDRESS : customToken;
    const token = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
    const tx = await token.approve(CONTRACT_ADDRESS, 0);
    await tx.wait();
    await checkApproval();
  };

  const send = async () => {
    const { recipients, amounts, total } = parseInput();
    if (!recipients.length) return alert("No valid inputs");
    let tx;
    if (mode === 'bnb') {
      tx = await contract.disperseBNB(recipients, amounts, { value: total });
    } else {
      const tokenAddr = mode === 'avg' ? AVG_TOKEN_ADDRESS : customToken;
      tx = await contract.disperseToken(tokenAddr, recipients, amounts);
    }
    await tx.wait();
    setTxHash(tx.hash);
  };

  useEffect(() => {
    if (wallet && mode) {
      checkBalance();
      checkApproval();
    }
  }, [wallet, mode, input, customToken]);

  return (
    <div className={styles.fullPage}>
      <div className={styles.container}>
        <div className={styles.header}>
          <img className={styles.logo} src="https://www.avocadodao.io/favicon/apple-touch-icon.png" alt="logo" />
          <h1 className={styles.title}>Avocado Disperser</h1>
        </div>

        {!wallet ? (
          <Button onClick={connect}>Connect Wallet</Button>
        ) : (
          <>
            <div className={styles.connected}>
              Connected: {wallet.slice(0, 6)}...{wallet.slice(-4)}
              <span className={styles.disconnect} onClick={disconnect}>Disconnect</span>
            </div>

            <div className={styles.tooltipWrapper}>
              <label className={styles.tooltipLabel}>
                Select Token
                <span className={styles.tooltip}>
                  Choose between BNB, AVG, or a custom token (paste address below).
                </span>
              </label>
              <select className={styles.select} value={mode} onChange={(e) => {
                setMode(e.target.value);
                setCustomSymbol('');
                setTxHash(null);
                setApproved(false);
              }}>
                <option value="">Select</option>
                <option value="bnb">BNB</option>
                <option value="avg">AVG</option>
                <option value="custom">Custom Token</option>
              </select>
            </div>

            {mode === 'custom' && (
              <div className={styles.tooltipWrapper}>
                <label className={styles.tooltipLabel}>
                  Paste Token Address
                  <span className={styles.tooltip}>
                    Enter the token contract address on BSC.
                  </span>
                </label>
                <input className={styles.select} value={customToken} onChange={e => setCustomToken(e.target.value)} placeholder="0x..." />
                <Button onClick={loadCustomToken} disabled={checking}>{checking ? 'Loading...' : 'Load Token'}</Button>
              </div>
            )}

            {customSymbol && (
              <div className={styles.preview}>Balance: {customBalance} {customSymbol}</div>
            )}

            <div className={styles.tooltipWrapper}>
              <label className={styles.tooltipLabel}>
                Recipients & Amounts
                <span className={styles.tooltip}>
                  One address per line. Format supported: comma, space or equal sign. e.g.:
                  <br />
                  0xabc..., 1.23<br />
                  0xabc... 1.23<br />
                  0xabc... = 1.23
                </span>
              </label>
              <textarea
                className={styles.textarea}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="0xabc..., 1.23\n0xabc... = 2.5"
              />
            </div>

            {(recipientCount > 0 || previewTotal !== '0') && (
              <div className={styles.preview}>
                Total Recipients: {recipientCount} | Total: {previewTotal} {customSymbol || mode.toUpperCase()}
              </div>
            )}

            {mode !== 'bnb' && !approved && <Button onClick={approve}>Approve</Button>}
            {mode !== 'bnb' && approved && <Button onClick={revoke}>Revoke</Button>}
            {(mode === 'bnb' || approved) && <Button onClick={send}>Send</Button>}

            {txHash && (
              <div className={styles.txinfo}>
                ✅ <a href={`https://bscscan.com/tx/${txHash}`} target="_blank" rel="noreferrer">Tx Hash</a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
