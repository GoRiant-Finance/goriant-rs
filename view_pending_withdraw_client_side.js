const anchor = require("@project-serum/anchor");
const utils = require("./utils");
const config = utils.readConfig();
const program_id = new anchor.web3.PublicKey(config.programId);
const sol = require("@solana/spl-token");
const provider = utils.provider;
const idl = utils.readIdl();
const BN = require('bn.js');
anchor.setProvider(provider);

let program = new anchor.Program(idl, program_id);

async function main() {


  // let balances = memberAccount.balances;
  // let state_pubKey = await program.state.address();
  const currentBlock = Math.floor(Date.now().valueOf() / 1000);
  let state = await program.state();
  const {
    precisionFactor,
    lastRewardBlock,
    rewardPerBlock,
    poolMint,
    memberRewardDebt,
    accTokenPerShare,
    startBlock,
    bonusEndBlock
  } = state;
  const member = await program.account.member.associatedAddress(provider.wallet.publicKey);
  const memberAccount = await program.account.member.associated(provider.wallet.publicKey);

  const tokenSupplyOfPoolMint = await provider.connection.getTokenSupply(poolMint);
  const memberTokenBalance = await provider.connection.getTokenAccountBalance(memberAccount.balances.vaultStake);
  const stakingToken = new BN(memberTokenBalance.value.amount);

  let totalStaking = new BN(tokenSupplyOfPoolMint.value.amount);
  if(totalStaking === 0) totalStaking = new BN(1)

  const multiplier = _getMultiplier(new BN(lastRewardBlock), new BN(currentBlock), bonusEndBlock);
  const tokenReward = multiplier.mul(rewardPerBlock);
  const newAccTokenPerShare = accTokenPerShare.add(tokenReward.mul(precisionFactor).div(totalStaking));
  const pendingReward = stakingToken
    .mul(newAccTokenPerShare)
    .div(precisionFactor)
    .sub(memberAccount.rewardDebt);

  console.log('newAccTokenPerShare: ', newAccTokenPerShare.toString());
  console.log('accTokenPerShare: ', accTokenPerShare.toString());
  console.log('Pending reward info: ',pendingReward.div(new BN(1_000_000_000)).toString());
  console.log('Current timestamp', currentBlock);
  console.log('Start block: ', startBlock.toString(), ' end block: ', bonusEndBlock.toString());
}

function _getMultiplier(_from, _to, bonusEndBlock) {
  if (_to <= bonusEndBlock) {
    return _to.sub(_from);
  } else if (_from >= bonusEndBlock) {
    return 0;
  } else {
    return bonusEndBlock.sub(_from);
  }
}

main().then(() => console.log('Success'));