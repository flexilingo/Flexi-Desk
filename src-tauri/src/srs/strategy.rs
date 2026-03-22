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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_creates_leitner() {
        let s = create_strategy(Algorithm::Leitner);
        assert_eq!(s.algorithm_name(), "leitner");
    }

    #[test]
    fn test_creates_sm2() {
        let s = create_strategy(Algorithm::SM2);
        assert_eq!(s.algorithm_name(), "sm2");
    }

    #[test]
    fn test_creates_fsrs() {
        let s = create_strategy(Algorithm::FSRS);
        assert_eq!(s.algorithm_name(), "fsrs");
    }
}
