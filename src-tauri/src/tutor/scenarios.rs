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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_scenarios_returns_nonempty_list() {
        assert!(!get_scenarios().is_empty());
    }

    #[test]
    fn test_get_scenarios_all_have_nonempty_ids() {
        for s in get_scenarios() {
            assert!(!s.id.is_empty(), "Empty id in scenario: {:?}", s.title);
        }
    }

    #[test]
    fn test_get_scenarios_all_have_nonempty_opening_prompts() {
        for s in get_scenarios() {
            assert!(
                !s.opening_prompt.is_empty(),
                "Empty opening_prompt in scenario: {}",
                s.id
            );
        }
    }

    #[test]
    fn test_get_scenarios_restaurant_order_exists() {
        let scenarios = get_scenarios();
        let found = scenarios.iter().any(|s| s.id == "restaurant_order");
        assert!(found);
    }

    #[test]
    fn test_get_scenarios_all_cefr_min_are_valid() {
        let valid_levels = ["A1", "A2", "B1", "B2", "C1", "C2"];
        for s in get_scenarios() {
            assert!(
                valid_levels.contains(&s.cefr_min.as_str()),
                "Invalid cefr_min '{}' in scenario '{}'",
                s.cefr_min,
                s.id
            );
        }
    }

    #[test]
    fn test_get_scenarios_ids_are_unique() {
        let scenarios = get_scenarios();
        let mut ids: Vec<&str> = scenarios.iter().map(|s| s.id.as_str()).collect();
        let original_len = ids.len();
        ids.dedup();
        ids.sort();
        let mut sorted = ids.clone();
        sorted.dedup();
        assert_eq!(original_len, sorted.len(), "Duplicate scenario IDs found");
    }
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
        // --- daily_life ---
        Scenario {
            id: "grocery_shopping".into(),
            title: "Grocery Shopping".into(),
            description: "Practice buying groceries, asking about prices, and finding items in a store.".into(),
            category: "daily_life".into(),
            cefr_min: "A1".into(),
            opening_prompt: "You are a friendly grocery store clerk. Greet the customer and ask if they need help finding anything.".into(),
        },
        Scenario {
            id: "pharmacy_visit".into(),
            title: "Pharmacy Visit".into(),
            description: "Describe symptoms to a pharmacist and ask about over-the-counter medicine.".into(),
            category: "daily_life".into(),
            cefr_min: "A2".into(),
            opening_prompt: "You are a pharmacist. Greet the customer and ask how you can help them today.".into(),
        },
        Scenario {
            id: "public_transport".into(),
            title: "Using Public Transport".into(),
            description: "Buy tickets, ask about schedules, and find the right platform or stop.".into(),
            category: "daily_life".into(),
            cefr_min: "A1".into(),
            opening_prompt: "You are a ticket agent at a train station. Greet the traveler and ask where they would like to go.".into(),
        },
        Scenario {
            id: "post_office".into(),
            title: "At the Post Office".into(),
            description: "Send packages, buy stamps, and ask about shipping options and delivery times.".into(),
            category: "daily_life".into(),
            cefr_min: "A2".into(),
            opening_prompt: "You are a postal clerk. Greet the customer and ask what they need to send today.".into(),
        },
        Scenario {
            id: "bank_visit".into(),
            title: "Visiting the Bank".into(),
            description: "Open an account, exchange currency, and ask about banking services.".into(),
            category: "daily_life".into(),
            cefr_min: "A2".into(),
            opening_prompt: "You are a bank teller. Greet the customer and ask how you can assist them.".into(),
        },
        Scenario {
            id: "laundromat".into(),
            title: "At the Laundromat".into(),
            description: "Use washing machines, ask for help, and make small talk with others.".into(),
            category: "daily_life".into(),
            cefr_min: "A1".into(),
            opening_prompt: "You are a regular at the local laundromat. Notice a newcomer looking confused and offer to help them use the machines.".into(),
        },
        Scenario {
            id: "gym_membership".into(),
            title: "Joining a Gym".into(),
            description: "Sign up for a membership, ask about classes, schedules, and equipment.".into(),
            category: "daily_life".into(),
            cefr_min: "A2".into(),
            opening_prompt: "You are a gym receptionist. Welcome the visitor and ask if they are interested in a membership.".into(),
        },
        Scenario {
            id: "pet_shop".into(),
            title: "At the Pet Shop".into(),
            description: "Ask about pet care, food options, and buy supplies for a pet.".into(),
            category: "daily_life".into(),
            cefr_min: "A1".into(),
            opening_prompt: "You are a pet shop owner. Greet the customer and ask what kind of pet they have.".into(),
        },
        Scenario {
            id: "haircut_salon".into(),
            title: "Getting a Haircut".into(),
            description: "Describe your desired haircut, discuss styles, and make small talk with the stylist.".into(),
            category: "daily_life".into(),
            cefr_min: "A2".into(),
            opening_prompt: "You are a hair stylist. Welcome the customer, seat them in the chair, and ask what kind of haircut they would like.".into(),
        },
        Scenario {
            id: "supermarket_checkout".into(),
            title: "Supermarket Checkout".into(),
            description: "Deal with discounts, loyalty cards, bags, and payment at the checkout.".into(),
            category: "daily_life".into(),
            cefr_min: "A1".into(),
            opening_prompt: "You are a supermarket cashier. Greet the customer and start scanning their items.".into(),
        },
        Scenario {
            id: "moving_day".into(),
            title: "Moving Day".into(),
            description: "Coordinate with movers, give instructions about furniture placement, and handle logistics.".into(),
            category: "daily_life".into(),
            cefr_min: "A2".into(),
            opening_prompt: "You are the lead mover on a moving crew. Arrive at the customer's home and ask where they want you to start.".into(),
        },
        Scenario {
            id: "car_mechanic".into(),
            title: "At the Car Mechanic".into(),
            description: "Describe car problems, understand repair quotes, and discuss timelines.".into(),
            category: "daily_life".into(),
            cefr_min: "A2".into(),
            opening_prompt: "You are an auto mechanic. Greet the customer and ask what seems to be the problem with their car.".into(),
        },
        // --- travel ---
        Scenario {
            id: "airport_checkin".into(),
            title: "Airport Check-in".into(),
            description: "Practice checking in at the airport, going through security, and finding your gate.".into(),
            category: "travel".into(),
            cefr_min: "A1".into(),
            opening_prompt: "You are an airline check-in agent. Greet the passenger and ask for their passport and booking reference.".into(),
        },
        Scenario {
            id: "car_rental".into(),
            title: "Renting a Car".into(),
            description: "Rent a car, discuss insurance options, and handle the return process.".into(),
            category: "travel".into(),
            cefr_min: "A2".into(),
            opening_prompt: "You are a car rental agent. Welcome the customer and ask what type of vehicle they are looking for.".into(),
        },
        Scenario {
            id: "tour_guide".into(),
            title: "Guided Tour".into(),
            description: "Ask about landmarks, learn history, and interact with a tour guide.".into(),
            category: "travel".into(),
            cefr_min: "A2".into(),
            opening_prompt: "You are a tour guide at a famous landmark. Welcome the group and begin describing the history of the site.".into(),
        },
        Scenario {
            id: "lost_luggage".into(),
            title: "Lost Luggage".into(),
            description: "Report lost bags at the airline counter, describe your luggage, and get help.".into(),
            category: "travel".into(),
            cefr_min: "A2".into(),
            opening_prompt: "You are an airline lost baggage agent. A worried passenger approaches. Ask them to describe what happened.".into(),
        },
        Scenario {
            id: "currency_exchange".into(),
            title: "Currency Exchange".into(),
            description: "Exchange money, ask about rates, and handle the transaction.".into(),
            category: "travel".into(),
            cefr_min: "A1".into(),
            opening_prompt: "You are a currency exchange clerk. Greet the customer and ask which currency they would like to exchange.".into(),
        },
        Scenario {
            id: "hostel_booking".into(),
            title: "Staying at a Hostel".into(),
            description: "Check in to a hostel, ask about facilities, and meet fellow travelers.".into(),
            category: "travel".into(),
            cefr_min: "A2".into(),
            opening_prompt: "You are a hostel receptionist. Welcome the guest warmly and ask if they have a reservation.".into(),
        },
        Scenario {
            id: "border_crossing".into(),
            title: "Border Crossing".into(),
            description: "Go through passport control, answer customs questions, and declare items.".into(),
            category: "travel".into(),
            cefr_min: "B1".into(),
            opening_prompt: "You are a border control officer. Ask the traveler for their passport and the purpose of their visit.".into(),
        },
        Scenario {
            id: "train_journey".into(),
            title: "Train Journey".into(),
            description: "Buy train tickets, find your seat, and ask about stops along the way.".into(),
            category: "travel".into(),
            cefr_min: "A1".into(),
            opening_prompt: "You are a train conductor. Welcome the passenger aboard and ask to see their ticket.".into(),
        },
        // --- social ---
        Scenario {
            id: "birthday_party".into(),
            title: "Planning a Birthday Party".into(),
            description: "Plan a party, invite friends, discuss gifts, decorations, and food.".into(),
            category: "social".into(),
            cefr_min: "A2".into(),
            opening_prompt: "You are a close friend. You just heard it is the student's birthday soon. Ask them about their plans and offer to help organize.".into(),
        },
        Scenario {
            id: "neighbor_complaint".into(),
            title: "Talking to a Neighbor".into(),
            description: "Politely address noise or other issues with a neighbor.".into(),
            category: "social".into(),
            cefr_min: "B1".into(),
            opening_prompt: "You are a neighbor who has been playing loud music. Answer the door when someone knocks and ask what is going on.".into(),
        },
        Scenario {
            id: "book_club".into(),
            title: "Book Club Meeting".into(),
            description: "Discuss a book, share opinions, and recommend new reads to the group.".into(),
            category: "social".into(),
            cefr_min: "B1".into(),
            opening_prompt: "You are a book club member. Welcome everyone to this month's meeting and ask who wants to share their thoughts on the book first.".into(),
        },
        Scenario {
            id: "coffee_date".into(),
            title: "Coffee Date".into(),
            description: "Meet someone for the first time, get to know them, and order drinks together.".into(),
            category: "social".into(),
            cefr_min: "A2".into(),
            opening_prompt: "You are meeting someone for a casual coffee for the first time. Arrive at the cafe, greet them, and suggest ordering something.".into(),
        },
        Scenario {
            id: "sports_team".into(),
            title: "Joining a Sports Team".into(),
            description: "Join a local sports team, learn the rules, and discuss the practice schedule.".into(),
            category: "social".into(),
            cefr_min: "A2".into(),
            opening_prompt: "You are the captain of a local sports team. Welcome a new player and explain how practices work.".into(),
        },
        Scenario {
            id: "volunteer_event".into(),
            title: "Volunteering".into(),
            description: "Sign up for volunteer work, coordinate tasks, and meet fellow volunteers.".into(),
            category: "social".into(),
            cefr_min: "A2".into(),
            opening_prompt: "You are a volunteer coordinator at a community event. Welcome a new volunteer and explain what needs to be done today.".into(),
        },
        Scenario {
            id: "house_warming".into(),
            title: "Housewarming Party".into(),
            description: "Welcome guests to your new home, give a tour, and accept gifts gracefully.".into(),
            category: "social".into(),
            cefr_min: "A2".into(),
            opening_prompt: "You are a guest arriving at a friend's housewarming party. Ring the doorbell with a gift and congratulate them on the new place.".into(),
        },
        Scenario {
            id: "reunion".into(),
            title: "Reunion with an Old Friend".into(),
            description: "Catch up with an old friend, share life updates, and reminisce about the past.".into(),
            category: "social".into(),
            cefr_min: "B1".into(),
            opening_prompt: "You are an old friend who has not seen the student in years. Spot them across the room, run up excitedly, and start catching up.".into(),
        },
        // --- professional ---
        Scenario {
            id: "salary_negotiation".into(),
            title: "Salary Negotiation".into(),
            description: "Discuss compensation, make counteroffers, and negotiate benefits.".into(),
            category: "professional".into(),
            cefr_min: "B2".into(),
            opening_prompt: "You are an HR manager. You have called the employee in to discuss their compensation package. Begin by asking how they feel about their current role.".into(),
        },
        Scenario {
            id: "team_meeting".into(),
            title: "Team Meeting".into(),
            description: "Present updates, discuss deadlines, and assign tasks to team members.".into(),
            category: "professional".into(),
            cefr_min: "B1".into(),
            opening_prompt: "You are the team lead starting the weekly meeting. Welcome everyone and ask for status updates on current projects.".into(),
        },
        Scenario {
            id: "client_presentation".into(),
            title: "Client Presentation".into(),
            description: "Pitch a product or service to a client, handle questions, and close the deal.".into(),
            category: "professional".into(),
            cefr_min: "B2".into(),
            opening_prompt: "You are a potential client attending a product presentation. Greet the presenter and say you are eager to hear what they have to offer.".into(),
        },
        Scenario {
            id: "tech_support".into(),
            title: "Tech Support Call".into(),
            description: "Troubleshoot a technical issue over the phone with a support agent.".into(),
            category: "professional".into(),
            cefr_min: "B1".into(),
            opening_prompt: "You are a tech support agent. Answer the call, greet the customer, and ask them to describe the issue they are experiencing.".into(),
        },
        Scenario {
            id: "networking_event".into(),
            title: "Networking Event".into(),
            description: "Introduce yourself professionally, exchange contacts, and make small talk at an industry event.".into(),
            category: "professional".into(),
            cefr_min: "B1".into(),
            opening_prompt: "You are a professional at an industry networking event. Approach the student with a smile, introduce yourself, and ask what brings them to the event.".into(),
        },
        Scenario {
            id: "performance_review".into(),
            title: "Performance Review".into(),
            description: "Discuss achievements, areas for improvement, and set goals for the future.".into(),
            category: "professional".into(),
            cefr_min: "B2".into(),
            opening_prompt: "You are a manager conducting an annual performance review. Welcome the employee and start by highlighting some of their recent accomplishments.".into(),
        },
        // --- academic ---
        Scenario {
            id: "university_enrollment".into(),
            title: "University Enrollment".into(),
            description: "Register for courses, ask about requirements, and navigate the enrollment process.".into(),
            category: "academic".into(),
            cefr_min: "B1".into(),
            opening_prompt: "You are a university registrar. Welcome the new student and ask which program they are enrolling in.".into(),
        },
        Scenario {
            id: "library_research".into(),
            title: "Library Research".into(),
            description: "Find resources, ask the librarian for help, and navigate the library system.".into(),
            category: "academic".into(),
            cefr_min: "B1".into(),
            opening_prompt: "You are a university librarian. Greet the student and ask what topic they are researching.".into(),
        },
        Scenario {
            id: "study_group".into(),
            title: "Study Group".into(),
            description: "Discuss assignments, explain concepts to peers, and prepare for exams together.".into(),
            category: "academic".into(),
            cefr_min: "B1".into(),
            opening_prompt: "You are a fellow student in a study group. Welcome everyone and suggest starting with the hardest topic first.".into(),
        },
        Scenario {
            id: "thesis_defense".into(),
            title: "Thesis Defense".into(),
            description: "Present your research, answer committee questions, and defend your findings.".into(),
            category: "academic".into(),
            cefr_min: "C1".into(),
            opening_prompt: "You are a thesis committee member. Welcome the student, congratulate them on reaching this stage, and ask them to present their research.".into(),
        },
        Scenario {
            id: "conference_talk".into(),
            title: "Conference Presentation".into(),
            description: "Present at an academic conference, handle Q&A, and network with researchers.".into(),
            category: "academic".into(),
            cefr_min: "B2".into(),
            opening_prompt: "You are a conference moderator. Introduce the speaker to the audience and invite them to begin their presentation.".into(),
        },
        // --- emergency ---
        Scenario {
            id: "emergency_call".into(),
            title: "Emergency Call".into(),
            description: "Call emergency services, describe the emergency, and give your location clearly.".into(),
            category: "emergency".into(),
            cefr_min: "A2".into(),
            opening_prompt: "You are an emergency dispatcher. Answer the call and calmly ask the caller what their emergency is and where they are located.".into(),
        },
        Scenario {
            id: "car_breakdown".into(),
            title: "Car Breakdown".into(),
            description: "Call roadside assistance, describe the problem, and communicate your location.".into(),
            category: "emergency".into(),
            cefr_min: "A2".into(),
            opening_prompt: "You are a roadside assistance operator. Answer the call and ask the driver to describe what happened and where they are.".into(),
        },
        Scenario {
            id: "lost_wallet".into(),
            title: "Lost Wallet".into(),
            description: "File a police report, cancel cards, and ask for help recovering your wallet.".into(),
            category: "emergency".into(),
            cefr_min: "B1".into(),
            opening_prompt: "You are a police officer at the front desk. A person walks in looking distressed. Ask them what happened.".into(),
        },
        Scenario {
            id: "insurance_claim".into(),
            title: "Filing an Insurance Claim".into(),
            description: "File an insurance claim, describe an incident, and understand the process.".into(),
            category: "emergency".into(),
            cefr_min: "B1".into(),
            opening_prompt: "You are an insurance claims agent. Greet the caller and ask them to describe the incident they need to file a claim for.".into(),
        },
        // --- creative ---
        Scenario {
            id: "cooking_class".into(),
            title: "Cooking Class".into(),
            description: "Follow recipe instructions, ask about techniques, and learn cooking vocabulary.".into(),
            category: "creative".into(),
            cefr_min: "A2".into(),
            opening_prompt: "You are a cooking class instructor. Welcome the students, introduce today's recipe, and ask if anyone has cooked this dish before.".into(),
        },
        Scenario {
            id: "art_gallery".into(),
            title: "Art Gallery Visit".into(),
            description: "Discuss artworks, express opinions about art, and learn art-related vocabulary.".into(),
            category: "creative".into(),
            cefr_min: "B1".into(),
            opening_prompt: "You are an art gallery guide. Welcome the visitor and stop in front of the first painting. Ask what they notice about it.".into(),
        },
        Scenario {
            id: "podcast_interview".into(),
            title: "Podcast Interview".into(),
            description: "Be interviewed about your hobby or area of expertise on a podcast.".into(),
            category: "creative".into(),
            cefr_min: "B1".into(),
            opening_prompt: "You are a podcast host. Welcome your guest to the show, introduce them to the audience, and ask what got them started in their field.".into(),
        },
        Scenario {
            id: "travel_blog".into(),
            title: "Travel Blog".into(),
            description: "Describe travel experiences, share tips, and write engaging stories.".into(),
            category: "creative".into(),
            cefr_min: "B1".into(),
            opening_prompt: "You are a travel blogger interviewing a fellow traveler. Ask them about the most memorable trip they have ever taken.".into(),
        },
        Scenario {
            id: "standup_comedy".into(),
            title: "Standup Comedy".into(),
            description: "Tell jokes, work on comedic timing, and interact with an audience.".into(),
            category: "creative".into(),
            cefr_min: "B2".into(),
            opening_prompt: "You are a comedy club host. Welcome the performer to the open mic night stage and get the audience hyped up.".into(),
        },
        Scenario {
            id: "music_lesson".into(),
            title: "Music Lesson".into(),
            description: "Learn about an instrument, discuss music theory, and practice musical vocabulary.".into(),
            category: "creative".into(),
            cefr_min: "A2".into(),
            opening_prompt: "You are a music teacher. Welcome the student to their first lesson and ask what instrument they would like to learn.".into(),
        },
        Scenario {
            id: "photography_walk".into(),
            title: "Photography Walk".into(),
            description: "Discuss composition, lighting, and subjects while on a photography walk.".into(),
            category: "creative".into(),
            cefr_min: "A2".into(),
            opening_prompt: "You are a photography instructor leading a photo walk. Gather the group and explain what to look for in today's outing.".into(),
        },
        Scenario {
            id: "wine_tasting".into(),
            title: "Wine Tasting".into(),
            description: "Describe flavors, learn about wine regions, and practice tasting vocabulary.".into(),
            category: "creative".into(),
            cefr_min: "B1".into(),
            opening_prompt: "You are a sommelier hosting a wine tasting event. Welcome the guests and pour the first wine. Ask them to describe what they smell and taste.".into(),
        },
    ]
}
