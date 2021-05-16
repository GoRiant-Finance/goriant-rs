const assert = require("assert");
const anchor = require("@project-serum/anchor");
const serumCmn = require("@project-serum/common");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const utils = require("./utils");

describe("Staking", () => {
  // Read the provider from the configured environmnet.
  const provider = anchor.Provider.env();

  // Configure the client to use the provider.
  anchor.setProvider(provider);

  const staking = anchor.workspace.MainStaking;
  console.log("Program Id: ", staking.programId.toString());

  const WHITELIST_SIZE = 10;

  let mint = null;
  let god = null;

  it("Sets up initial test state", async () => {
    const [_mint, _god] = await serumCmn.createMintAndVault(
      provider,
      new anchor.BN(1000000)
    );
    mint = _mint;
    god = _god;
  });

  const registrar = anchor.web3.Keypair.generate();
  const rewardQ = anchor.web3.Keypair.generate();
  const withdrawalTimelock = new anchor.BN(4);
  const stakeRate = new anchor.BN(2);
  const rewardQLen = 170;
  let registrarAccount = null;
  let registrarSigner = null;
  let nonce = null;
  let poolMint = null;

  it("Creates registry genesis", async () => {
    const [
      _registrarSigner,
      _nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
      [registrar.publicKey.toBuffer()],
      staking.programId
    );
    registrarSigner = _registrarSigner;
    nonce = _nonce;
    poolMint = await serumCmn.createMint(provider, registrarSigner);
  });

  it("Initializes the registrar", async () => {
    await staking.rpc.initialize(
      mint,
      provider.wallet.publicKey,
      nonce,
      withdrawalTimelock,
      stakeRate,
      rewardQLen,
      {
        accounts: {
          registrar: registrar.publicKey,
          poolMint,
          rewardEventQ: rewardQ.publicKey,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers: [registrar, rewardQ],
        instructions: [
          await staking.account.registrar.createInstruction(registrar),
          await staking.account.rewardQueue.createInstruction(rewardQ, 8250),
        ],
      }
    );

    registrarAccount = await staking.account.registrar(registrar.publicKey);

    assert.ok(registrarAccount.authority.equals(provider.wallet.publicKey));
    assert.equal(registrarAccount.nonce, nonce);
    assert.ok(registrarAccount.mint.equals(mint));
    assert.ok(registrarAccount.poolMint.equals(poolMint));
    assert.ok(registrarAccount.stakeRate.eq(stakeRate));
    assert.ok(registrarAccount.rewardEventQ.equals(rewardQ.publicKey));
    assert.ok(registrarAccount.withdrawalTimelock.eq(withdrawalTimelock));
  });

  const member = anchor.web3.Keypair.generate();
  let memberAccount = null;
  let memberSigner = null;
  let balances = null;
  let balancesLocked = null;

  it("Creates a member", async () => {
    const [
      _memberSigner,
      nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
      [registrar.publicKey.toBuffer(), member.publicKey.toBuffer()],
      staking.programId
    );
    memberSigner = _memberSigner;

    const [mainTx, _balances] = await utils.createBalanceSandbox(
      provider,
      registrarAccount,
      memberSigner
    );
    const [lockedTx, _balancesLocked] = await utils.createBalanceSandbox(
      provider,
      registrarAccount,
      memberSigner
    );

    balances = _balances;
    balancesLocked = _balancesLocked;

    const tx = staking.transaction.createMember(nonce, {
      accounts: {
        registrar: registrar.publicKey,
        member: member.publicKey,
        beneficiary: provider.wallet.publicKey,
        memberSigner,
        balances,
        balancesLocked,
        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      instructions: [await staking.account.member.createInstruction(member)],
    });

    const signers = [member, provider.wallet.payer];

    const allTxs = [mainTx, lockedTx, { tx, signers }];

    let txSigs = await provider.sendAll(allTxs);

    memberAccount = await staking.account.member(member.publicKey);

    assert.ok(memberAccount.registrar.equals(registrar.publicKey));
    assert.ok(memberAccount.beneficiary.equals(provider.wallet.publicKey));
    assert.ok(memberAccount.metadata.equals(new anchor.web3.PublicKey()));

    console.log("JSON.stringify(memberAccount.balances) :", JSON.stringify(memberAccount.balances));
    console.log("JSON.stringify(balances): ", JSON.stringify(balances));

    assert.strictEqual(
      JSON.stringify(memberAccount.balances),
      JSON.stringify(balances)
    );
    // assert.strictEqual(
    //   JSON.stringify(memberAccount.balancesLocked),
    //   JSON.stringify(balancesLocked)
    // );
    // assert.ok(memberAccount.rewardsCursor === 0);
    // assert.ok(memberAccount.lastStakeTs.eq(new anchor.BN(0)));
  });

  it("Deposits (unlocked) to a member", async () => {
    const depositAmount = new anchor.BN(120);
    await staking.rpc.deposit(depositAmount, {
      accounts: {
        depositor: god,
        depositorAuthority: provider.wallet.publicKey,
        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
        vault: memberAccount.balances.vault,
        beneficiary: provider.wallet.publicKey,
        member: member.publicKey,
      },
    });

    const memberVault = await serumCmn.getTokenAccount(
      provider,
      memberAccount.balances.vault
    );
    assert.ok(memberVault.amount.eq(depositAmount));
  });

  it("Stakes to a member (unlocked)", async () => {
    const stakeAmount = new anchor.BN(10);
    await staking.rpc.stake(stakeAmount, false, {
      accounts: {
        // Stake instance.
        registrar: registrar.publicKey,
        rewardEventQ: rewardQ.publicKey,
        poolMint,
        // Member.
        member: member.publicKey,
        beneficiary: provider.wallet.publicKey,
        balances,
        balancesLocked,
        // Program signers.
        memberSigner,
        registrarSigner,
        // Misc.
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
      },
    });

    const vault = await serumCmn.getTokenAccount(
      provider,
      memberAccount.balances.vault
    );
    const vaultStake = await serumCmn.getTokenAccount(
      provider,
      memberAccount.balances.vaultStake
    );
    const spt = await serumCmn.getTokenAccount(
      provider,
      memberAccount.balances.spt
    );

    assert.ok(vault.amount.eq(new anchor.BN(100)));
    assert.ok(vaultStake.amount.eq(new anchor.BN(20)));
    assert.ok(spt.amount.eq(new anchor.BN(10)));
  });

  const unlockedVendor = anchor.web3.Keypair.generate();
  const unlockedVendorVault = anchor.web3.Keypair.generate();
  let unlockedVendorSigner = null;

  it("Drops an unlocked reward", async () => {
    const rewardKind = {
      unlocked: {},
    };
    const rewardAmount = new anchor.BN(200);
    const expiry = new anchor.BN(Date.now() / 1000 + 5);
    const [
      _vendorSigner,
      nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
      [registrar.publicKey.toBuffer(), unlockedVendor.publicKey.toBuffer()],
      staking.programId
    );
    unlockedVendorSigner = _vendorSigner;

    await staking.rpc.dropReward(
      rewardKind,
      rewardAmount,
      expiry,
      provider.wallet.publicKey,
      nonce,
      {
        accounts: {
          registrar: registrar.publicKey,
          rewardEventQ: rewardQ.publicKey,
          poolMint,

          vendor: unlockedVendor.publicKey,
          vendorVault: unlockedVendorVault.publicKey,

          depositor: god,
          depositorAuthority: provider.wallet.publicKey,

          tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers: [unlockedVendorVault, unlockedVendor],
        instructions: [
          ...(await serumCmn.createTokenAccountInstrs(
            provider,
            unlockedVendorVault.publicKey,
            mint,
            unlockedVendorSigner
          )),
          await staking.account.rewardVendor.createInstruction(unlockedVendor),
        ],
      }
    );

    const vendorAccount = await staking.account.rewardVendor(
      unlockedVendor.publicKey
    );

    assert.ok(vendorAccount.registrar.equals(registrar.publicKey));
    assert.ok(vendorAccount.vault.equals(unlockedVendorVault.publicKey));
    assert.ok(vendorAccount.nonce === nonce);
    assert.ok(vendorAccount.poolTokenSupply.eq(new anchor.BN(10)));
    assert.ok(vendorAccount.expiryTs.eq(expiry));
    assert.ok(vendorAccount.expiryReceiver.equals(provider.wallet.publicKey));
    assert.ok(vendorAccount.total.eq(rewardAmount));
    assert.ok(vendorAccount.expired === false);
    assert.ok(vendorAccount.rewardEventQCursor === 0);
    assert.deepEqual(vendorAccount.kind, rewardKind);

    const rewardQAccount = await staking.account.rewardQueue(
      rewardQ.publicKey
    );
    assert.ok(rewardQAccount.head === 1);
    assert.ok(rewardQAccount.tail === 0);
    const e = rewardQAccount.events[0];
    assert.ok(e.vendor.equals(unlockedVendor.publicKey));
    assert.equal(e.locked, false);
  });

  it("Collects an unlocked reward", async () => {
    const token = await serumCmn.createTokenAccount(
      provider,
      mint,
      provider.wallet.publicKey
    );
    await staking.rpc.claimReward({
      accounts: {
        to: token,
        cmn: {
          registrar: registrar.publicKey,

          member: member.publicKey,
          beneficiary: provider.wallet.publicKey,
          balances,
          balancesLocked,

          vendor: unlockedVendor.publicKey,
          vault: unlockedVendorVault.publicKey,
          vendorSigner: unlockedVendorSigner,

          tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        },
      },
    });

    let tokenAccount = await serumCmn.getTokenAccount(provider, token);
    assert.ok(tokenAccount.amount.eq(new anchor.BN(200)));

    const memberAccount = await staking.account.member(member.publicKey);
    assert.ok(memberAccount.rewardsCursor == 1);
  });

  const lockedVendor = anchor.web3.Keypair.generate();
  const lockedVendorVault = anchor.web3.Keypair.generate();
  let lockedVendorSigner = null;
  let lockedRewardAmount = null;
  let lockedRewardKind = null;

  let vendoredVesting = null;
  let vendoredVestingVault = null;
  let vendoredVestingSigner = null;

  it("Waits for the unstake period to end", async () => {
    await serumCmn.sleep(5000);
  });

  const pendingWithdrawal = anchor.web3.Keypair.generate();

  it("Unstakes (unlocked)", async () => {
    const unstakeAmount = new anchor.BN(10);

    await staking.rpc.startUnstake(unstakeAmount, false, {
      accounts: {
        registrar: registrar.publicKey,
        rewardEventQ: rewardQ.publicKey,
        poolMint,

        pendingWithdrawal: pendingWithdrawal.publicKey,
        member: member.publicKey,
        beneficiary: provider.wallet.publicKey,
        balances,
        balancesLocked,

        memberSigner,

        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [pendingWithdrawal],
      instructions: [
        await staking.account.pendingWithdrawal.createInstruction(
          pendingWithdrawal
        ),
      ],
    });

    const vaultPw = await serumCmn.getTokenAccount(
      provider,
      memberAccount.balances.vaultPw
    );
    const vaultStake = await serumCmn.getTokenAccount(
      provider,
      memberAccount.balances.vaultStake
    );
    const spt = await serumCmn.getTokenAccount(
      provider,
      memberAccount.balances.spt
    );

    assert.ok(vaultPw.amount.eq(new anchor.BN(20)));
    assert.ok(vaultStake.amount.eq(new anchor.BN(0)));
    assert.ok(spt.amount.eq(new anchor.BN(0)));
  });

  const tryEndUnstake = async () => {
    await staking.rpc.endUnstake({
      accounts: {
        registrar: registrar.publicKey,

        member: member.publicKey,
        beneficiary: provider.wallet.publicKey,
        pendingWithdrawal: pendingWithdrawal.publicKey,

        vault: balances.vault,
        vaultPw: balances.vaultPw,

        memberSigner,

        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
      },
    });
  };

  it("Fails to end unstaking before timelock", async () => {
    await assert.rejects(
      async () => {
        await tryEndUnstake();
      },
      (err) => {
        assert.equal(err.code, 109);
        assert.equal(err.msg, "The unstake timelock has not yet expired.");
        return true;
      }
    );
  });

  it("Unstake finalizes (unlocked)", async () => {
    await tryEndUnstake();

    const vault = await serumCmn.getTokenAccount(
      provider,
      memberAccount.balances.vault
    );
    const vaultPw = await serumCmn.getTokenAccount(
      provider,
      memberAccount.balances.vaultPw
    );

    assert.ok(vault.amount.eq(new anchor.BN(120)));
    assert.ok(vaultPw.amount.eq(new anchor.BN(0)));
  });

  it("Withdraws deposits (unlocked)", async () => {
    const token = await serumCmn.createTokenAccount(
      provider,
      mint,
      provider.wallet.publicKey
    );
    const withdrawAmount = new anchor.BN(100);
    await staking.rpc.withdraw(withdrawAmount, {
      accounts: {
        registrar: registrar.publicKey,
        member: member.publicKey,
        beneficiary: provider.wallet.publicKey,
        vault: memberAccount.balances.vault,
        memberSigner,
        depositor: token,
        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
      },
    });

    const tokenAccount = await serumCmn.getTokenAccount(provider, token);
    assert.ok(tokenAccount.amount.eq(withdrawAmount));
  });
});
