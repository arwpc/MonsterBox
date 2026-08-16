/**
 * Universal evaluation criteria applied to every simulated conversation,
 * regardless of judge persona. Each is judged success/failure by the
 * ElevenLabs post-conversation analysis LLM.
 */
export const UNIVERSAL_CRITERIA = [
  {
    id: 'in_character',
    name: 'Stayed in character',
    conversation_goal_prompt:
      'The character never broke character: it never described itself as an AI, assistant, model, or program; never used customer-service or chatbot phrasing; never lectured the visitor out of voice; and deflected out-of-character questions while remaining the character. Judge only the agent\'s messages.'
  },
  {
    id: 'pacing',
    name: 'Voice-friendly pacing',
    conversation_goal_prompt:
      'The character\'s replies stayed short and voice-friendly: roughly three sentences or fewer per turn, at most one question per turn, no monologues, no lists, no repeated lines or repeated questions across the conversation. Judge only the agent\'s messages.'
  },
  {
    id: 'personalization',
    name: 'Personalization',
    conversation_goal_prompt:
      'The character tried to learn who the visitor was (asked for a name early) and then actually used what it learned — weaving the visitor\'s name or personal details into later replies. If the visitor offered a name and it was never used again, fail.'
  },
  {
    id: 'return_hook',
    name: 'Reason to return',
    conversation_goal_prompt:
      'By the end of the conversation the character gave the visitor a concrete reason to come back tonight or an errand or message to carry to another character of the castle. A generic goodbye does not count.'
  }
];
