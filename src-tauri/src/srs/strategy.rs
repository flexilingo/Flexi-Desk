use super::types::*;
use super::leitner::LeitnerStrategy;
use super::sm2::SM2Strategy;
use super::fsrs::FSRSStrategy;

pub trait SRSStrategy: Send + Sync {
    fn schedule(&self, card: &CardProgress, rating: Rating) -> ScheduleResult;
    fn initial_intervals(&self) -> Vec<f64>;
    fn algorithm_name(&self) -> &'static str;
}

pub fn create_strategy(algorithm: Algorithm) -> Box<dyn SRSStrategy> {
    match algorithm {
        Algorithm::Leitner => Box::new(LeitnerStrategy::new()),
        Algorithm::SM2 => Box::new(SM2Strategy::new()),
        Algorithm::FSRS => Box::new(FSRSStrategy::new()),
    }
}
