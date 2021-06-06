const {expect} = require("chai");
const anchor = require("@project-serum/anchor");
const {TokenInstructions} = require("@project-serum/serum");
const serumCmn = require("@project-serum/common");
const {LAMPORTS_PER_SOL} = require("@solana/web3.js");
const utils = require("./utils");
const SECOND_IN_DAY = 86_400; // second

describe("test staking program", () => {

  const provider = anchor.Provider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Staking;
  const owner = provider.wallet.publicKey;
  let mint;
  let god;

  describe("init staking program", () => {

    it("new StakingPool", async () => {

      // given
      const [_mint, _god] = await serumCmn.createMintAndVault(
        provider,
        new anchor.BN(1_000_000 * LAMPORTS_PER_SOL),
        owner, 9);
      mint = _mint;
      god = _god;
      const rewardVault = new anchor.web3.Keypair();

      const stateRate = new anchor.BN(1);
      const withdrawTimeLock = new anchor.BN(0);
      // reward start immediately
      const startBlock = new anchor.BN(new Date().getTime() / 1000);
      // reward end after 30 day
      const endBlock = new anchor.BN(new Date().getTime() / 1000 + (SECOND_IN_DAY * 30));
      const rewardPerBlock = new anchor.BN(0.1 * LAMPORTS_PER_SOL);
      let statePubKey = await program.state.address();

      const [stakingPoolImprint, stateImprintNonce] = await anchor.web3.PublicKey.findProgramAddress(
        [statePubKey.toBuffer()],
        program.programId
      );

      /// pool mint with state authority
      const poolMint = await serumCmn.createMint(provider, stakingPoolImprint, 9);

      // when
      let tx = await program.state.rpc.new(
        mint,
        statePubKey,
        stateImprintNonce,
        stateRate,
        withdrawTimeLock,
        startBlock,
        rewardPerBlock,
        endBlock,
        {
          accounts: {
            authority: owner,
            poolMint,
            rewardVault: rewardVault.publicKey,
            rewardDeposit: god,
            rewardAuthority: owner,
            tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY
          },
          signers: [rewardVault],
          instructions: [
            ...(await serumCmn.createTokenAccountInstrs(
              provider,
              rewardVault.publicKey,
              mint,
              stakingPoolImprint
            ))
          ]
        }
      );

      // then
      let state = await program.state();
      expect(tx).to.exist;

      expect(state.key).to.eql(statePubKey);
      expect(state.authority).to.eql(owner);
      expect(state.mint).to.eql(mint);
      expect(state.poolMint).to.eql(poolMint);

      expect(state.rewardVault).to.eql(rewardVault.publicKey);
      expect(state.startBlock).to.eql(startBlock);
      expect(state.bonusEndBlock).to.eql(endBlock);
      expect(state.lastRewardBlock).to.eql(startBlock);
      expect(state.accTokenPerShare.toString()).to.equal("0");
      expect(state.stakeRate.toString()).to.equal("1");
      expect(state.rewardPerBlock.toString()).to.equal("100000000");

    });
  })

  describe("create member", () => {

    it("new member", async () => {

      let {balances, txSigns, tx} = await createMember(program, owner, provider);

      // then
      let memberAccount = await program.account.member.associated(owner);

      expect(txSigns).to.exist;
      expect(tx).to.exist;
      expect(memberAccount.authority).to.eql(owner);
      expect(memberAccount.rewardDebt.toString()).to.equal("0");
      expect(memberAccount.balances.spt.publicKey).to.eql(balances.spt.publicKey);
      expect(memberAccount.balances.vaultStake.publicKey).to.eql(balances.vaultStake.publicKey);
    })

    it("create member again should throw error due to member is #[associated]", async () => {
      try {
        await createMember(program, owner, provider);
      } catch (e) {
        expect(e).to.not.be.undefined;
      }
    })
  })

  describe("deposit", () => {

    it("deposit 1000 riant", async () => {
      const amount = 1_000;
      let statePubKey = await program.state.address();
      let state = await program.state();
      let member = await program.account.member.associatedAddress(owner);
      let memberAccount = await program.account.member.associated(owner);
      let balances = memberAccount.balances;
      const [memberImprint, nonce,] = await anchor.web3.PublicKey.findProgramAddress(
        [statePubKey.toBuffer(), member.toBuffer()],
        program.programId
      );

      let depositAmount = new anchor.BN(amount * LAMPORTS_PER_SOL);
      let tx = await program.rpc.deposit(
        depositAmount,
        {
          accounts: {
            stakingPool: statePubKey,
            poolMint: state.poolMint,
            imprint: state.imprint,
            rewardVault: state.rewardVault,
            member: member,
            authority: owner,
            balances: balances,
            memberImprint: memberImprint,
            depositor: god,
            depositorAuthority: owner,
            tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY
          }
        }
      );

      // then
      expect(tx).to.exist;

      // re-fetch latest state & memberAccount from Staking program
      state = await program.state();
      memberAccount = await program.account.member.associated(owner);

      const riantStaking = await provider.connection.getTokenAccountBalance(balances.vaultStake)
      const totalStaking = await provider.connection.getTokenSupply(state.poolMint);

      expect(riantStaking.value.uiAmount, "Client staking should be 1,000").to.equal(1000);
      expect(totalStaking.value.uiAmount, "Total staking should be 1,000").to.equal(1000);

      // assert member account
      expect(memberAccount.authority).to.eql(owner);
      expect(memberAccount.balances.spt.publicKey).to.eql(balances.spt.publicKey);
      expect(memberAccount.balances.vaultStake.publicKey).to.eql(balances.vaultStake.publicKey);
      expect(memberAccount.rewardDebt.toString()).to.equal("0");

      // assert program state
      expect(state.key).to.eql(statePubKey);
      expect(state.authority).to.eql(owner);
      expect(state.mint).to.eql(mint);
      expect(state.accTokenPerShare.toString()).to.equal("0");
      expect(state.stakeRate.toString()).to.equal("1");
      expect(state.rewardPerBlock.toString()).to.equal("100000000");
    })

    it("deposit 0 riant after 10 second should receive pending reward", async () => {

    })
  })

  describe("withdrawal", () => {

    it("withdrawal 500 riant", async () => {

      // when
      const tx = await withdrawal(program, owner, god, 500);

      // then
      const tokenAccounts = (await provider.connection.getTokenAccountsByOwner(owner, {mint})).value;

      expect(tx).to.exist;
      expect(tokenAccounts).to.have.lengthOf(1);
      const riantBalance = await provider.connection.getTokenAccountBalance(tokenAccounts[0].pubkey);
      expect(riantBalance.value.uiAmount).to.be.greaterThan(500);
    })

    it("withdrawal zero amount should throw error", async () => {
      // when
      try {
        await withdrawal(program, owner, god, 0);
      } catch (e) {
        expect(e).to.exist;
      }
    })

    it("withdraw insufficient staking amount should throw error", async () => {
      // current staking
      const memberAccount = await program.account.member.associated(owner);
      const stakingBalance = await provider.connection.getTokenAccountBalance(memberAccount.balances.vaultStake);
      expect(stakingBalance.value.uiAmount).to.equal(500);

      // when
      try {
        await withdrawal(program, owner, god, 501);
      } catch (e) {
        expect(e).to.exist;
      }
    })
  })

});

async function createMember(program, owner, provider) {
  // given
  let statePubKey = await program.state.address();
  let state = await program.state();
  let member = await program.account.member.associatedAddress(owner);

  const [memberImprint, member_nonce] = await anchor.web3.PublicKey.findProgramAddress(
    [statePubKey.toBuffer(), member.toBuffer()],
    program.programId
  );

  const [mainTx, balances] = await utils.createBalanceSandbox(provider, state, memberImprint);
  let txSigns = await provider.send(mainTx.tx, mainTx.signers);

  // when
  let tx = await program.rpc.createMember(
    member_nonce,
    {
      accounts: {
        stakingPool: statePubKey,
        member: member,
        authority: owner,
        balances: balances,
        memberImprint: memberImprint,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        systemProgram: anchor.web3.SystemProgram.programId
      }
    }
  );
  return {balances, txSigns, tx};
}

async function withdrawal(program, owner, god, amount) {
  // given
  let statePubKey = await program.state.address();
  let state = await program.state();
  let member = await program.account.member.associatedAddress(owner);
  let memberAccount = await program.account.member.associated(owner);
  let balances = memberAccount.balances;

  const [memberImprint, nonce,] = await anchor.web3.PublicKey.findProgramAddress(
    [statePubKey.toBuffer(), member.toBuffer()],
    program.programId
  );

  let withdrawAmount = new anchor.BN(amount * LAMPORTS_PER_SOL);

  // when
  let tx = await program.rpc.withdraw(
    withdrawAmount,
    {
      accounts: {
        stakingPool: statePubKey,
        imprint: state.imprint,
        poolMint: state.poolMint,
        rewardVault: state.rewardVault,
        member: member,
        authority: owner,
        balances: balances,
        memberImprint: memberImprint,
        beneficial: god,
        beneficialAuthority: owner,
        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      }
    }
  );
  return tx;
}