import { useEffect, useState } from 'react';
import Button from '../components/ui/button';
import styles from '../styles/DisperseUI.module.css';
import { ethers } from 'ethers';

const CONTRACT_ADDRESS = '0x59b990c626853DC951A38EFC1dF50abb4d48Ca75';
const AVG_TOKEN_ADDRESS = '0xa41F142b6eb2b164f8164CAE0716892Ce02f311f';
const BSC_MAINNET_CHAIN_ID = '0x38'; // BNB Chain Mainnet

const CONTRACT_ABI = [
  "function disperseBNB(address[] calldata recipients, uint256[] calldata amounts) external payable",
  "function disperseToken(address token, address[] calldata recipients, uint256[] calldata amounts) external"
];

const AVG_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function decimals() view returns (uint8)"
];

export default function Home() {
  const [walletAddress, setWalletAddress] = useState('');
  const [mode, setMode] = useState('');
  const [inputText, setInputText] = useState('');
  const [approved, setApproved] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const [previewTotal, setPreviewTotal] = useState('0');

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
          params: [{ chainId: BSC_MAINNET_CHAIN_ID }],
        });
      } catch (error) {
        if (error.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: BSC_MAINNET_CHAIN_ID,
              chainName: 'BNB Chain',
              nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
              rpcUrls: ['https://bsc-dataseed.binance.org/'],
              blockExplorerUrls: ['https://bscscan.com']
            }]
          });
        } else {
          alert("Please switch to BNB Chain manually in MetaMask.");
        }
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
      const [address, amount] = line.split(/[, ]+/);
      if (ethers.utils.isAddress(address) && !isNaN(parseFloat(amount))) {
        recipients.push(address);
        amounts.push(ethers.utils.parseUnits(amount.trim(), 18));
      }
    }

    const total = amounts.reduce((sum, val) => sum.add(val), ethers.BigNumber.from(0));
    setPreviewTotal(ethers.utils.formatUnits(total, 18));
    return { recipients, amounts, total };
  };

  const checkApproval = async () => {
    if (!walletAddress || !signer) return;
    const avg = new ethers.Contract(AVG_TOKEN_ADDRESS, AVG_ABI, signer);
    const allowance = await avg.allowance(walletAddress, CONTRACT_ADDRESS);
    setApproved(allowance.gt(0));
  };

  const approveAVG = async () => {
    const { total } = parseInput();
    const avg = new ethers.Contract(AVG_TOKEN_ADDRESS, AVG_ABI, signer);
    const tx = await avg.approve(CONTRACT_ADDRESS, ethers.constants.MaxUint256);
    await tx.wait();
    setApproved(true);
  };

  const revokeAVG = async () => {
    const avg = new ethers.Contract(AVG_TOKEN_ADDRESS, AVG_ABI, signer);
    const tx = await avg.approve(CONTRACT_ADDRESS, 0);
    await tx.wait();
    setApproved(false);
  };

  const sendDisperse = async () => {
    const { recipients, amounts, total } = parseInput();
    if (!recipients.length) return alert("Invalid input");

    let tx;
    if (mode === 'bnb') {
      tx = await contract.disperseBNB(recipients, amounts, { value: total });
    } else {
      tx = await contract.disperseToken(AVG_TOKEN_ADDRESS, recipients, amounts);
    }
    await tx.wait();
    setTxHash(tx.hash);
  };

  useEffect(() => {
    if (mode === 'avg') checkApproval();
  }, [walletAddress, mode, inputText]);

  return (
    <div className={styles.fullPage}>
      <div className={styles.container}>
        <h1 className={styles.title}>BNB / $AVG Disperse</h1>

        {!walletAddress ? (
          <Button onClick={connectWallet}>Connect Wallet</Button>
        ) : (
          <>
            <div className={styles.connected}>
              Connected: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              <span className={styles.disconnect} onClick={disconnectWallet}>Disconnect</span>
            </div>

            <select className={styles.select} onChange={(e) => {
              setMode(e.target.value);
              setApproved(false);
              setTxHash(null);
              setInputText('');
              setPreviewTotal('0');
            }}>
              <option value="">Select Token</option>
              <option value="bnb">BNB</option>
              <option value="avg">AVG</option>
            </select>

            {mode && (
              <>
                <textarea
                  className={styles.textarea}
                  value={inputText}
                  onChange={(e) => {
                    setInputText(e.target.value);
                    parseInput();
                  }}
                  placeholder="0xAddress, 1.23"
                  rows={8}
                />

                {previewTotal !== '0' && (
                  <div className={styles.preview}>
                    Estimated Total: {previewTotal} {mode === 'bnb' ? 'BNB' : 'AVG'}
                  </div>
                )}

                {mode === 'avg' && !approved && (
                  <Button onClick={approveAVG}>Approve AVG</Button>
                )}

                {mode === 'avg' && approved && (
                  <Button onClick={revokeAVG}>Revoke AVG</Button>
                )}

                {(mode === 'bnb' || approved) && (
                  <Button onClick={sendDisperse}>Send</Button>
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
