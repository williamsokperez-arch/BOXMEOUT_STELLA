/// Full lifecycle integration tests for the prediction market contract.
///
/// Run with: cargo test --features testutils
///
/// Strategy: most contract functions are `todo!()` stubs. Tests use two approaches:
///   1. Direct storage seeding + implemented functions for real assertions.
///   2. `try_*` client calls to assert the correct error is returned from
///      implemented guard logic (emergency pause, auth, validation).
extern crate std;

use prediction_market::{
    errors::PredictionMarketError,
    prediction_market::{PredictionMarketContract, PredictionMarketContractClient},
    storage::DataKey,
    types::{
        AmmPool, Config, Dispute, DisputeStatus, FeeConfig, LpPosition, Market, MarketMetadata,
        MarketStats, MarketStatus, OracleReport, Outcome, UserPosition,
    },
};
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    vec, Address, Env, String as SStr, Vec as SVec,
};

// =============================================================================
// Test helpers
// =============================================================================

fn fee_config() -> FeeConfig {
    FeeConfig { protocol_fee_bps: 100, lp_fee_bps: 200, creator_fee_bps: 50 }
}

fn metadata(env: &Env) -> MarketMetadata {
    MarketMetadata {
        category: SStr::from_str(env, "sports"),
        tags: SStr::from_str(env, "wrestling"),
        image_url: SStr::from_str(env, "https://img.example.com"),
        description: SStr::from_str(env, "Main event."),
        source_url: SStr::from_str(env, "https://example.com"),
    }
}

fn outcomes(env: &Env) -> SVec<SStr> {
    vec![env, SStr::from_str(env, "YES"), SStr::from_str(env, "NO")]
}

fn outcome_vec(env: &Env) -> SVec<Outcome> {
    vec![
        env,
        Outcome { id: 0, label: SStr::from_str(env, "YES"), total_shares_outstanding: 0 },
        Outcome { id: 1, label: SStr::from_str(env, "NO"),  total_shares_outstanding: 0 },
    ]
}

/// Register contract and seed Config + EmergencyPause + NextMarketId.
fn setup(env: &Env) -> (Address, PredictionMarketContractClient, Address, Address, Address) {
    let id  = env.register(PredictionMarketContract, ());
    let cli = PredictionMarketContractClient::new(env, &id);
    let admin    = Address::generate(env);
    let oracle   = Address::generate(env);
    let treasury = Address::generate(env);

    let cfg = Config {
        admin: admin.clone(),
        default_oracle: oracle.clone(),
        token: Address::generate(env),
        fee_config: fee_config(),
        min_liquidity: 1_000,
        min_trade: 100,
        max_outcomes: 10,
        max_market_duration_secs: 86_400,
        dispute_bond: 500,
        emergency_paused: false,
        treasury: treasury.clone(),
    };
    env.as_contract(&id, || {
        env.storage().persistent().set(&DataKey::Config, &cfg);
        env.storage().persistent().set(&DataKey::EmergencyPause, &false);
        env.storage().persistent().set(&DataKey::NextMarketId, &1_u64);
    });
    (id, cli, admin, oracle, treasury)
}

fn seed_open_market(env: &Env, contract_id: &Address, market_id: u64, creator: &Address) -> Market {
    let m = Market {
        market_id,
        creator: creator.clone(),
        question: SStr::from_str(env, "Who wins?"),
        betting_close_time: env.ledger().timestamp() + 3_600,
        resolution_deadline: env.ledger().timestamp() + 7_200,
        dispute_window_secs: 3_600,
        outcomes: outcome_vec(env),
        status: MarketStatus::Open,
        winning_outcome_id: None,
        protocol_fee_pool: 0, lp_fee_pool: 0, creator_fee_pool: 0,
        total_collateral: 1_000, total_lp_shares: 100,
        metadata: metadata(env),
    };
    env.as_contract(contract_id, || {
        env.storage().persistent().set(&DataKey::Market(market_id), &m);
        env.storage().persistent().set(&DataKey::MarketStats(market_id), &MarketStats {
            market_id, total_volume: 0, volume_24h: 0,
            last_trade_at: 0, unique_traders: 0, open_interest: 0,
        });
    });
    m
}

fn seed_pool(env: &Env, contract_id: &Address, market_id: u64) {
    env.as_contract(contract_id, || {
        env.storage().persistent().set(&DataKey::AmmPool(market_id), &AmmPool {
            market_id,
            reserves: vec![env, 500_i128, 500_i128],
            invariant_k: 250_000,
            total_collateral: 1_000,
        });
    });
}

fn seed_lp(env: &Env, contract_id: &Address, market_id: u64, provider: &Address, shares: i128) {
    env.as_contract(contract_id, || {
        env.storage().persistent().set(
            &DataKey::LpPosition(market_id, provider.clone()),
            &LpPosition {
                market_id, provider: provider.clone(),
                lp_shares: shares, collateral_contributed: shares * 10, fees_claimed: 0,
            },
        );
    });
}

fn set_pause(env: &Env, contract_id: &Address, paused: bool) {
    env.as_contract(contract_id, || {
        env.storage().persistent().set(&DataKey::EmergencyPause, &paused);
    });
}

// =============================================================================
// 1. Happy path — create_market (implemented portion)
// =============================================================================

#[test]
fn happy_path_create_market_succeeds() {
    let env = Env::default();
    env.ledger().set_timestamp(1_000);
    env.mock_all_auths();

    let (contract_id, cli, admin, _, _) = setup(&env);

    let mid = cli.create_market(
        &admin,
        &SStr::from_str(&env, "Who wins the main event?"),
        &5_000_u64,
        &8_000_u64,
        &3_600_u64,
        &outcomes(&env),
        &metadata(&env),
    );
    assert_eq!(mid, 1);

    let market: Market = env.as_contract(&contract_id, || {
        env.storage().persistent().get(&DataKey::Market(1)).unwrap()
    });
    assert_eq!(market.status, MarketStatus::Initializing);
    assert_eq!(market.outcomes.len(), 2);
    assert_eq!(market.creator, admin);
}

#[test]
fn happy_path_create_market_rejects_emergency_pause() {
    let env = Env::default();
    env.ledger().set_timestamp(1_000);
    env.mock_all_auths();

    let (contract_id, cli, admin, _, _) = setup(&env);
    set_pause(&env, &contract_id, true);

    let r = cli.try_create_market(
        &admin, &SStr::from_str(&env, "Q"), &5_000_u64, &8_000_u64,
        &3_600_u64, &outcomes(&env), &metadata(&env),
    );
    assert_eq!(r, Err(Ok(PredictionMarketError::EmergencyPaused)));
}

#[test]
fn happy_path_create_market_rejects_unauthorized() {
    let env = Env::default();
    env.ledger().set_timestamp(1_000);
    env.mock_all_auths();

    let (_contract_id, cli, _, _, _) = setup(&env);
    let outsider = Address::generate(&env);

    let r = cli.try_create_market(
        &outsider, &SStr::from_str(&env, "Q"), &5_000_u64, &8_000_u64,
        &3_600_u64, &outcomes(&env), &metadata(&env),
    );
    assert_eq!(r, Err(Ok(PredictionMarketError::Unauthorized)));
}

// =============================================================================
// 2. Dispute flow — stubs verified; emergency_resolve guard tested via pause
// =============================================================================

#[test]
fn dispute_flow_emergency_resolve_is_stub() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, cli, _, _, _) = setup(&env);

    // todo!() stubs panic — catch_unwind confirms entry-point exists
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        cli.emergency_resolve(&1_u64, &0_u32);
    }));
    assert!(r.is_err(), "emergency_resolve must be a todo!() stub");
}

#[test]
fn dispute_flow_report_and_dispute_are_stubs() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, cli, _, _, _) = setup(&env);

    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        cli.report_outcome(&1_u64, &0_u32);
    }));
    assert!(r.is_err(), "report_outcome must be a todo!() stub");

    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let disputer = Address::generate(&env);
        cli.dispute_outcome(&disputer, &1_u64, &1_u32, &SStr::from_str(&env, "wrong"));
    }));
    assert!(r.is_err(), "dispute_outcome must be a todo!() stub");
}

// =============================================================================
// 3. Dispute rejected — resolve_dispute stub
// =============================================================================

#[test]
fn dispute_rejected_resolve_dispute_is_stub() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, cli, _, _, _) = setup(&env);

    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        cli.resolve_dispute(&1_u64, &false, &None); // upheld=false → slash bond
    }));
    assert!(r.is_err(), "resolve_dispute must be a todo!() stub");
}

// =============================================================================
// 4. Cancel flow — cancel_market and refund_position stubs
// =============================================================================

#[test]
fn cancel_flow_stubs_exist() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, cli, _, _, _) = setup(&env);
    let holder = Address::generate(&env);

    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        cli.cancel_market(&1_u64);
    }));
    assert!(r.is_err(), "cancel_market must be a todo!() stub");

    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        cli.refund_position(&holder, &1_u64);
    }));
    assert!(r.is_err(), "refund_position must be a todo!() stub");
}

// =============================================================================
// 5. LP flow — remove_liquidity (implemented) + add/claim stubs
// =============================================================================

#[test]
fn lp_flow_remove_liquidity_partial_burn() {
    let env = Env::default();
    env.ledger().set_timestamp(5_000); // past betting_close_time
    env.mock_all_auths();

    let (contract_id, cli, admin, _, _) = setup(&env);
    let provider = Address::generate(&env);
    let mid = 1_u64;

    // Market with betting_close_time in the past so withdrawal is allowed
    let m = Market {
        market_id: mid, creator: admin.clone(),
        question: SStr::from_str(&env, "LP test"),
        betting_close_time: 1_000, resolution_deadline: 10_000,
        dispute_window_secs: 3_600, outcomes: outcome_vec(&env),
        status: MarketStatus::Open, winning_outcome_id: None,
        protocol_fee_pool: 0, lp_fee_pool: 0, creator_fee_pool: 0,
        total_collateral: 1_000, total_lp_shares: 100,
        metadata: metadata(&env),
    };
    env.as_contract(&contract_id, || {
        env.storage().persistent().set(&DataKey::Market(mid), &m);
        env.storage().persistent().set(&DataKey::MarketStats(mid), &MarketStats {
            market_id: mid, total_volume: 0, volume_24h: 0,
            last_trade_at: 0, unique_traders: 0, open_interest: 0,
        });
    });
    seed_pool(&env, &contract_id, mid);
    seed_lp(&env, &contract_id, mid, &provider, 50);

    let out = cli.remove_liquidity(&provider, &mid, &20_i128);
    assert_eq!(out, 200); // 20/100 * 1000

    let pos: LpPosition = env.as_contract(&contract_id, || {
        env.storage().persistent().get(&DataKey::LpPosition(mid, provider.clone())).unwrap()
    });
    assert_eq!(pos.lp_shares, 30);
}

#[test]
fn lp_flow_remove_liquidity_full_burn_removes_position() {
    let env = Env::default();
    env.ledger().set_timestamp(5_000);
    env.mock_all_auths();

    let (contract_id, cli, admin, _, _) = setup(&env);
    let provider = Address::generate(&env);
    let mid = 2_u64;

    let m = Market {
        market_id: mid, creator: admin.clone(),
        question: SStr::from_str(&env, "Full burn"),
        betting_close_time: 1_000, resolution_deadline: 10_000,
        dispute_window_secs: 3_600, outcomes: outcome_vec(&env),
        status: MarketStatus::Open, winning_outcome_id: None,
        protocol_fee_pool: 0, lp_fee_pool: 0, creator_fee_pool: 0,
        total_collateral: 1_000, total_lp_shares: 100,
        metadata: metadata(&env),
    };
    env.as_contract(&contract_id, || {
        env.storage().persistent().set(&DataKey::Market(mid), &m);
        env.storage().persistent().set(&DataKey::MarketStats(mid), &MarketStats {
            market_id: mid, total_volume: 0, volume_24h: 0,
            last_trade_at: 0, unique_traders: 0, open_interest: 0,
        });
    });
    seed_pool(&env, &contract_id, mid);
    seed_lp(&env, &contract_id, mid, &provider, 40);

    cli.remove_liquidity(&provider, &mid, &40_i128);

    let pos: Option<LpPosition> = env.as_contract(&contract_id, || {
        env.storage().persistent().get(&DataKey::LpPosition(mid, provider.clone()))
    });
    assert!(pos.is_none(), "position should be removed after full burn");
}

#[test]
fn lp_flow_remove_liquidity_blocked_before_betting_close() {
    let env = Env::default();
    env.ledger().set_timestamp(500); // before betting_close_time
    env.mock_all_auths();

    let (contract_id, cli, admin, _, _) = setup(&env);
    let provider = Address::generate(&env);
    let mid = 3_u64;

    seed_open_market(&env, &contract_id, mid, &admin); // betting_close_time = now+3600
    seed_pool(&env, &contract_id, mid);
    seed_lp(&env, &contract_id, mid, &provider, 50);

    let r = cli.try_remove_liquidity(&provider, &mid, &10_i128);
    assert_eq!(r, Err(Ok(PredictionMarketError::BettingClosed)));
}

#[test]
fn lp_flow_add_liquidity_and_claim_fees_are_stubs() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, cli, _, _, _) = setup(&env);
    let provider = Address::generate(&env);

    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        cli.add_liquidity(&provider, &1_u64, &5_000_i128);
    }));
    assert!(r.is_err(), "add_liquidity must be a todo!() stub");

    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        cli.claim_lp_fees(&provider, &1_u64);
    }));
    assert!(r.is_err(), "claim_lp_fees must be a todo!() stub");
}

// =============================================================================
// 6. Batch redeem — stub
// =============================================================================

#[test]
fn batch_redeem_is_stub() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, cli, _, _, _) = setup(&env);
    let holder = Address::generate(&env);

    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        cli.batch_redeem(
            &holder,
            &vec![&env, 1_u64, 2_u64, 3_u64],
            &vec![&env, 0_u32, 0_u32, 1_u32],
        );
    }));
    assert!(r.is_err(), "batch_redeem must be a todo!() stub");
}

// =============================================================================
// 7. Split / merge — stubs
// =============================================================================

#[test]
fn split_merge_are_stubs() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, cli, _, _, _) = setup(&env);
    let caller = Address::generate(&env);

    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        cli.split_position(&caller, &1_u64, &1_000_i128);
    }));
    assert!(r.is_err(), "split_position must be a todo!() stub");

    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        cli.merge_positions(&caller, &1_u64, &500_i128);
    }));
    assert!(r.is_err(), "merge_positions must be a todo!() stub");
}

// =============================================================================
// 8. Slippage — buy_shares stub; guard will return SlippageExceeded once implemented
// =============================================================================

#[test]
fn slippage_buy_shares_is_stub() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, cli, _, _, _) = setup(&env);
    let buyer = Address::generate(&env);

    // min_shares_out = i128::MAX forces SlippageExceeded once implemented
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        cli.buy_shares(&buyer, &1_u64, &0_u32, &1_000_i128, &i128::MAX);
    }));
    assert!(r.is_err(), "buy_shares must be a todo!() stub");
}

// =============================================================================
// 9. Emergency pause — pause blocks mutations; unpause restores them
// =============================================================================

#[test]
fn emergency_pause_blocks_create_market() {
    let env = Env::default();
    env.ledger().set_timestamp(1_000);
    env.mock_all_auths();

    let (contract_id, cli, admin, _, _) = setup(&env);
    set_pause(&env, &contract_id, true);

    let r = cli.try_create_market(
        &admin, &SStr::from_str(&env, "Q"), &5_000_u64, &8_000_u64,
        &3_600_u64, &outcomes(&env), &metadata(&env),
    );
    assert_eq!(r, Err(Ok(PredictionMarketError::EmergencyPaused)));
}

#[test]
fn emergency_pause_blocks_remove_liquidity() {
    let env = Env::default();
    env.ledger().set_timestamp(5_000);
    env.mock_all_auths();

    let (contract_id, cli, admin, _, _) = setup(&env);
    let provider = Address::generate(&env);
    let mid = 4_u64;

    let m = Market {
        market_id: mid, creator: admin.clone(),
        question: SStr::from_str(&env, "Paused LP"),
        betting_close_time: 1_000, resolution_deadline: 10_000,
        dispute_window_secs: 3_600, outcomes: outcome_vec(&env),
        status: MarketStatus::Open, winning_outcome_id: None,
        protocol_fee_pool: 0, lp_fee_pool: 0, creator_fee_pool: 0,
        total_collateral: 1_000, total_lp_shares: 100,
        metadata: metadata(&env),
    };
    env.as_contract(&contract_id, || {
        env.storage().persistent().set(&DataKey::Market(mid), &m);
        env.storage().persistent().set(&DataKey::MarketStats(mid), &MarketStats {
            market_id: mid, total_volume: 0, volume_24h: 0,
            last_trade_at: 0, unique_traders: 0, open_interest: 0,
        });
    });
    seed_pool(&env, &contract_id, mid);
    seed_lp(&env, &contract_id, mid, &provider, 50);
    set_pause(&env, &contract_id, true);

    let r = cli.try_remove_liquidity(&provider, &mid, &10_i128);
    assert_eq!(r, Err(Ok(PredictionMarketError::EmergencyPaused)));
}

#[test]
fn emergency_unpause_restores_create_market() {
    let env = Env::default();
    env.ledger().set_timestamp(1_000);
    env.mock_all_auths();

    let (contract_id, cli, admin, _, _) = setup(&env);
    set_pause(&env, &contract_id, true);
    set_pause(&env, &contract_id, false); // unpause

    let mid = cli.create_market(
        &admin, &SStr::from_str(&env, "Q"), &5_000_u64, &8_000_u64,
        &3_600_u64, &outcomes(&env), &metadata(&env),
    );
    assert_eq!(mid, 1);
}

#[test]
fn emergency_pause_and_unpause_entry_points_are_stubs() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, cli, _, _, _) = setup(&env);

    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        cli.emergency_pause();
    }));
    assert!(r.is_err(), "emergency_pause must be a todo!() stub");

    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        cli.emergency_unpause();
    }));
    assert!(r.is_err(), "emergency_unpause must be a todo!() stub");
}
