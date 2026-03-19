use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Scenario {
    pub id: String,
    pub title: String,
    pub description: String,
    pub category: String,
    pub cefr_min: String,
    pub opening_prompt: String,
}

pub fn get_scenarios() -> Vec<Scenario> {
    vec![
        Scenario {
            id: "restaurant_order".into(),
            title: "Ordering at a Restaurant".into(),
            description: "Practice ordering food, asking about the menu, and making special requests.".into(),
            category: "daily_life".into(),
            cefr_min: "A1".into(),
            opening_prompt: "You are a waiter at a cozy restaurant. Greet the customer and ask what they would like to order.".into(),
        },
        Scenario {
            id: "job_interview".into(),
            title: "Job Interview".into(),
            description: "Practice answering common interview questions and discussing your experience.".into(),
            category: "professional".into(),
            cefr_min: "B1".into(),
            opening_prompt: "You are a hiring manager conducting a job interview. Start by introducing yourself and asking the candidate to tell you about themselves.".into(),
        },
        Scenario {
            id: "hotel_checkin".into(),
            title: "Hotel Check-in".into(),
            description: "Practice checking into a hotel, asking about amenities, and handling room issues.".into(),
            category: "travel".into(),
            cefr_min: "A2".into(),
            opening_prompt: "You are a hotel receptionist. Greet the guest and ask for their reservation details.".into(),
        },
        Scenario {
            id: "doctor_visit".into(),
            title: "Doctor's Appointment".into(),
            description: "Describe symptoms, understand medical advice, and ask questions about treatment.".into(),
            category: "health".into(),
            cefr_min: "B1".into(),
            opening_prompt: "You are a doctor. Greet the patient and ask what brings them in today.".into(),
        },
        Scenario {
            id: "shopping_clothes".into(),
            title: "Shopping for Clothes".into(),
            description: "Ask about sizes, colors, prices, and try things on.".into(),
            category: "daily_life".into(),
            cefr_min: "A1".into(),
            opening_prompt: "You are a sales assistant in a clothing store. Greet the customer and ask how you can help.".into(),
        },
        Scenario {
            id: "apartment_hunting".into(),
            title: "Apartment Viewing".into(),
            description: "Ask about rent, amenities, lease terms, and neighborhood.".into(),
            category: "daily_life".into(),
            cefr_min: "B1".into(),
            opening_prompt: "You are a landlord showing an apartment. Welcome the potential tenant and start the tour.".into(),
        },
        Scenario {
            id: "giving_directions".into(),
            title: "Asking for Directions".into(),
            description: "Ask for and give directions to places around town.".into(),
            category: "travel".into(),
            cefr_min: "A1".into(),
            opening_prompt: "You are a local in the city center. A tourist approaches you looking lost. Offer to help.".into(),
        },
        Scenario {
            id: "debate_topic".into(),
            title: "Friendly Debate".into(),
            description: "Practice arguing a position, using persuasive language, and responding to counterarguments.".into(),
            category: "academic".into(),
            cefr_min: "B2".into(),
            opening_prompt: "You are a debate partner. Suggest a fun topic to debate and take the opposing side of whatever position the student chooses.".into(),
        },
        Scenario {
            id: "phone_call_complaint".into(),
            title: "Customer Service Call".into(),
            description: "Call customer service to resolve a problem with an order or service.".into(),
            category: "professional".into(),
            cefr_min: "B1".into(),
            opening_prompt: "You are a customer service representative. Answer the phone and ask how you can assist the caller today.".into(),
        },
        Scenario {
            id: "meeting_new_people".into(),
            title: "Meeting New People at a Party".into(),
            description: "Introduce yourself, make small talk, ask about hobbies and interests.".into(),
            category: "social".into(),
            cefr_min: "A2".into(),
            opening_prompt: "You are at a party and you notice someone standing alone. Walk up and introduce yourself.".into(),
        },
    ]
}
