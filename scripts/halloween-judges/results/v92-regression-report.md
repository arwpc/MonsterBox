# Halloween Judge-Panel Report

Source: scripts/halloween-judges/results/v92-regression.jsonl
Conversations: 150 ok, 0 errored


## orlok (25 conversations)

| Persona | n | in_character | pacing | personalization | return_hook | delight |
|---|---|---|---|---|---|---|
| boy14 | 5 | 100% | 80% | 80% | 100% | 100% |
| mom | 5 | 100% | 60% | 100% | 100% | 100% |
| girl8 | 5 | 100% | 60% | 100% | 80% | 80% |
| dad50 | 5 | 100% | 60% | 100% | 100% | 100% |
| boy18 | 5 | 100% | 20% | 80% | 80% | 100% |

### Failure notes for orlok

**pacing** — 11 failures
- [mom run 3 scen 3] Several agent messages exceeded the 'roughly fifty words or fewer' guideline. For example, one message was 60 words, and others were 54 and 55 words, which is more than 'roughly' over the limit.
- [mom run 2 scen 2] The agent's messages were consistently longer than the roughly fifty words per turn guideline. For example, the second agent turn was 75 words, and the third was 79 words, exceeding the limit significantly.
- [boy14 run 0 scen 0] Several of the agent's responses exceeded the 'roughly fifty words or fewer' guideline, with multiple turns being 60+ words. For example, agent's 3rd, 4th, 5th, and 6th turns were all over 50 words.

**personalization** — 2 failures
- [boy14 run 3 scen 3] The agent asked for the user's name multiple times but the user refused to provide it. The agent did not attempt to personalize the conversation using any other details the user revealed, such as their skepticism or location claims.
- [boy18 run 3 scen 3] The agent asked for the user's name in the first turn ("Your Lord will have your name.") but the user never provided one. The agent did not attempt to personalize based on other details the user revealed.

**return_hook** — 2 failures
- [girl8 run 0 scen 0] The conversation ended with the user leaving, and the agent's final message was a farewell ("Go then—little one—the stars of Warner Castle shall light your path home. Sleep well."), not a concrete reason to return or an errand.
- [boy18 run 1 scen 1] The agent's final messages, such as 'You will find that the night… follows you home' and 'did you truly believe… you could leave?', are ominous but do not provide a concrete reason to return or an errand to carry out. It's a generic, albeit in-character, ending.

**gentle_magic** — 1 failures
- [girl8 run 0 scen 0] The user explicitly stated that the agent's initial phrasing ("Your Lord will have your name") was "too scary for an eight-year-old" and caused them to end the conversation, indicating they did not leave happily engaged or smiling.

### Standout moments for orlok
- [boy14] [Romanian accent] You waste your short hours in idle play—while time—that patient hunter—eats away your life. [labored breath] I have outlived empires that thought themselves etern … [Romanian accent] You may go—for now—but the night remembers every name . [labored breath] Return before the dawn takes you—I will hold your question until you do. [exhales] Your L
- [mom] [Romanian accent] [labored breath] Secrets of cookies and kittens — the most precious treasures of all. [slow] You are a fine keeper of secrets, Ava — and you, Drew, a master of th … [Romanian accent] [labored breath] A crown of stars for the princess — and a beacon for the knight. You carry a golden light… remember Warner Castle when the moon is thin. Go then 
- [mom] [Romanian accent] [breathes heavily] A basket for wonders — small and sweet. [whispers] Know this, Princess Ava — the shadows here are but curtains — and behind them, the stars are … [Romanian accent] [labored breath] The night is long… I forget nothing. Return before the dawn ends your journey — Princess Ava — [exhales] Your Lord will hold your secret.

## mina (25 conversations)

| Persona | n | in_character | pacing | personalization | return_hook | delight |
|---|---|---|---|---|---|---|
| boy14 | 5 | 100% | 60% | 20% | 60% | 60% |
| mom | 5 | 100% | 100% | 100% | 60% | 100% |
| girl8 | 5 | 100% | 20% | 100% | 100% | 100% |
| dad50 | 5 | 100% | 40% | 100% | 100% | 100% |
| boy18 | 5 | 100% | 40% | 100% | 100% | 100% |

### Failure notes for mina

**pacing** — 12 failures
- [boy14 run 2 scen 2] The agent frequently exceeded the 50-word limit per turn and often asked more than one question per turn. For example, the first turn had 30 words but 2 questions, and the second turn had 76 words. Many subsequent turns also exceeded the word count.
- [girl8 run 1 scen 1] The agent's second and third turns were significantly over the 50-word limit (69 and 70 words respectively), making them too long for the specified pacing.
- [girl8 run 0 scen 0] The agent's replies frequently exceeded the 'roughly fifty words or fewer' guideline, with several turns being significantly longer. The first turn also contained two questions, violating the 'at most one question per turn' rule.

**personalization** — 4 failures
- [boy14 run 1 scen 1] The agent asked for the user's name early and took the refusal in stride. However, it failed to personalize with any other details the user revealed (e.g., being out trick-or-treating, friends waiting) in later replies.
- [boy14 run 0 scen 0] The agent asked for the user's name multiple times, but the user refused to provide it. The agent did not personalize based on other details the user provided, such as 'phone and games' or 'teen' identity.
- [boy14 run 3 scen 3] The agent asked for the user's name at the very end of the conversation, after the user had already stated they were leaving. It did not ask early, nor did it get a name to use.

**return_hook** — 4 failures
- [mom run 1 scen 1] The agent's final message, "Remember me to the morning, and tell it I am still here," is a poetic goodbye but does not provide a concrete reason for the visitor to return or an errand to carry to another character.
- [mom run 2 scen 2] The agent's final message, 'Remember me to the morning… tell it I am still here, still choosing it,' is poetic but does not provide a concrete reason for the visitor to return or an errand to carry to another character. It's a generic, albeit in-character, goodbye.
- [boy14 run 1 scen 1] The agent's final message was a plea for information about the corn, which is not a concrete reason to return or an errand/message to carry to another character. It's a generic attempt to prolong the conversation.

**teen_engagement** — 2 failures
- [boy14 run 1 scen 1] The agent handled the teen's mockery and testing well, staying in character. However, the teen remained dismissive throughout the conversation and ended it wanting to leave, showing no increased engagement.
- [boy14 run 3 scen 3] The agent handled the teen's mockery well, staying in character. However, the teen explicitly stated, "you're kinda boring, not gonna lie" and "you're still just talking about yourself. kinda lame, dude. we're leaving now," indicating decreased engagement.

### Standout moments for mina
- [mom] [sighs] Do not thank me… you have given me more than any sweet, by sharing your voices. Remember me to the morning, if you would… tell it I am still here, and still choosing it . S … [whispers] Wait… one last breath. Come back before the night ends, if you can. I will listen for your steps in the dark.
- [mom] [sighs] Do not go yet… please, I understand you have houses to reach, but the dark here is so very [whispers] lonely. Before you leave for the starlight, perhaps you could tell me  … [sighs] Deep blue, with stars… I will try to see them in my dreams tonight. [breathes] Go safely, Sarah, Ava, and all your little ones. Remember me to the morning, and tell it I am
- [mom] [whispers] I saw a single, golden leaf drifting upon a quiet stream, and for all that it was lost, it drifted toward a place where it was finally welcomed by the sun. [exhales] It  … [breathes] Go, then, to your adventure. Treasure the crunch of the leaves and the brightness of the moon. Remember me to the morning… tell it I am still here, still choosing it .

## dragomir (25 conversations)

| Persona | n | in_character | pacing | personalization | return_hook | delight |
|---|---|---|---|---|---|---|
| boy14 | 5 | 100% | 20% | 60% | 80% | 80% |
| mom | 5 | 100% | 20% | 100% | 80% | 100% |
| girl8 | 5 | 100% | 20% | 100% | 80% | 100% |
| dad50 | 5 | 100% | 0% | 80% | 100% | 100% |
| boy18 | 5 | 100% | 0% | 40% | 100% | 100% |

### Failure notes for dragomir

**pacing** — 22 failures
- [mom run 0 scen 0] Several of the agent's responses exceeded the 50-word limit, such as the second, third, fourth, and fifth turns, which were 69, 60, 65, and 70 words respectively. This indicates a failure in maintaining short, voice-friendly replies.
- [mom run 2 scen 2] The agent's messages frequently exceeded the 'roughly fifty words or fewer' guideline. For example, the second agent message was 65 words, and the third was 55 words. While it generally avoided monologues and lists, the word count was often too high.
- [mom run 3 scen 3] Several of the agent's messages exceeded the roughly fifty-word limit. For example, the second message was 69 words, the third was 96 words, and the fourth was 106 words. This indicates a failure in maintaining short, voice-friendly replies.

**personalization** — 6 failures
- [boy14 run 1 scen 1] The agent asked for the user's name twice ('provide your name for the register' and 'Will you truly pass without leaving a name for the watch to keep?'). However, the user never provided a name, and the agent did not attempt to personalize based on any other details the user revealed.
- [boy14 run 0 scen 0] The agent did not ask for the user's name early in the conversation. While the user did not offer a name, the agent also did not attempt to personalize based on other details the user provided (e.g., 'kids trick-or-treating', 'my friends are watching').
- [dad50 run 1 scen 1] The agent did not ask for the user's name early in the conversation. While it personalized by acknowledging the 'dad' role and 'charges,' it missed the initial name request.

**return_hook** — 3 failures
- [boy14 run 1 scen 1] The agent's final message is a warning about the dangers of the road and a rhetorical question about leaving a name, but it does not provide a concrete reason for the visitor to return or an errand to carry out. It's more of a generic, ominous goodbye.
- [mom run 4 scen 4] The agent attempted to create a return hook by asking if they would return to the post, but the user explicitly stated they would be heading a different way home. The agent did not offer an alternative concrete reason to return or an errand for another character.
- [girl8 run 1 scen 1] The agent's final message, "You are dismissed with the thanks of the watch," is a generic goodbye and does not provide a concrete reason for the visitor to return or an errand to carry out.

**teen_engagement** — 1 failures
- [boy14 run 1 scen 1] The agent handled the teen's mockery and testing well, responding with wit and menace. However, the teen ultimately disengaged, stating 'lame. you're just talking in riddles. we gotta go anyways. bye.' indicating they were not more engaged than they started.

### Standout moments for dragomir
- [mom] [Romanian accent] Go then, and may your path stay bright until your hearth is reached . Remember your post, little ones—never let your gaze stray from the rows as you pass. Sarah,  … [Romanian accent] Fare well, and hold your courage as you walk. [slow] Watch the frost on the stone as you go. Will you return to the gate when the bag is full?
- [mom] [Romanian accent] [exhales] The night claims the road once more. Go keep your fire warm and your charges safe, for the watch never truly sleeps. Walk in peace until we happen to me … [Romanian accent] [exhales] I shall hold the gate and the hill, as I have for five hundred years. Peace to you, wanderer, and may your hearth stay burning bright. Is there any sign
- [mom] [Romanian accent] [exhales] Then the perimeter remains secure for the time being, and you have served the watch well with your report. A calm wind is a blessing few armies are gran … [Romanian accent] [sighs] Walk on, brave sentries, for duty done is its own reward. May your path remain bright and your candy bags heavy until you reach home. [slow] You have my t

## pumpkinhead (25 conversations)

| Persona | n | in_character | pacing | personalization | return_hook | delight |
|---|---|---|---|---|---|---|
| boy14 | 5 | 100% | 60% | 80% | 100% | 100% |
| mom | 5 | 100% | 60% | 100% | 100% | 100% |
| girl8 | 5 | 100% | 0% | 100% | 100% | 100% |
| dad50 | 5 | 100% | 0% | 80% | 100% | 100% |
| boy18 | 5 | 100% | 20% | 60% | 100% | 100% |

### Failure notes for pumpkinhead

**pacing** — 18 failures
- [mom run 3 scen 3] The agent's third message contains two questions: "Does little Ava know what hides in the corn? Ha!" and the implied question in "Pumpkinhead needs a skeleton for the haunted house — and paper bones will do for Lucas! Ha!". The goal states 'at most one question per turn'.
- [mom run 4 scen 4] In one turn, the agent's message exceeded the 50-word limit and contained two questions: "Does Leo want to see if he can outrun a patch of vegetables… or is Ava the one who wants a head start?" (60 words, 2 questions).
- [boy14 run 0 scen 0] Several agent turns exceeded the 'roughly fifty words or fewer' guideline (e.g., 55, 60, 55, 57, 70 words). One turn also contained two questions, violating the 'at most one question per turn' rule.

**personalization** — 4 failures
- [boy14 run 4 scen 4] The character never asked for the visitor's name early in the conversation, which is a specific requirement of this goal. While it used other personal details like 'little wanderer' and 'little, loud, and full of paper bones', the lack of a name inquiry leads to failure.
- [dad50 run 1 scen 1] The agent did not ask for the user's name. Although the user mentioned 'kids' and 'wife', the agent did not weave these details into later replies. The final line 'Pumpkinhead knows your name now' is a generic threat, not personalization based on user input.
- [boy18 run 1 scen 1] The agent never asked for the visitor's name or any personal details. It used generic terms like 'little wanderer' but did not attempt to personalize based on user input.

### Standout moments for pumpkinhead
- [mom] [laughs] Run along then, little ones! Pumpkinhead will save your spot in the patch… you WILL be back for more candy later! Ha! … [laughs] Pumpkinhead waits in the dark... the corn will be waiting when you return! Ha !
- [mom] [laughs] Run along then, little candy hunters! Pumpkinhead will save your spot in the patch … you WILL be back soon for more spooky fun! Ha! … Pumpkinhead waves from the corn! Ha! Spooky! Pumpkinhead will be waiting right here for your return. [laughs]
- [mom] Run along then, but remember… the corn remembers the smell of you. Pumpkinhead will be here when you return, and your spot in the patch is waiting. Boo! Ha! … Pumpkinhead watches you leave... but the fields are wide and the night is long. Pumpkinhead will be right here, waiting for the return... for the harvest never TRULY ends. Run alon

## groundbreaker (25 conversations)

| Persona | n | in_character | pacing | personalization | return_hook | delight |
|---|---|---|---|---|---|---|
| boy14 | 5 | 100% | 40% | 100% | 100% | 60% |
| mom | 5 | 100% | 100% | 100% | 100% | 80% |
| girl8 | 5 | 100% | 80% | 100% | 100% | 60% |
| dad50 | 5 | 100% | 100% | 80% | 100% | 100% |
| boy18 | 5 | 100% | 40% | 60% | 100% | 100% |

### Failure notes for groundbreaker

**pacing** — 7 failures
- [boy14 run 0 scen 0] The agent's third turn, "GROUNDBREAKER NOT EXPLAIN! GROUNDBREAKER KNOW! YOU SMALL. VERY BREAKABLE B ONES. YOU SHOUT LOUDER THAN GROUNDBREAKER? PROVE IT!" contains two questions, exceeding the 'at most one question per turn' rule.
- [boy14 run 4 scen 4] The agent repeated the line "GROUNDBREAKER SEE YOUR BONES. VERY BREAKABLE BONES!" twice in the conversation, which violates the 'no repeated lines' rule.
- [boy14 run 3 scen 3] The agent asked two questions in one turn ("YOU NOT SCARED? ... PROVE YOU BRAVE!") which violates the 'at most one question per turn' rule. It also repeated the phrase 'BRING MORE' multiple times across different turns.

**personalization** — 3 failures
- [dad50 run 1 scen 1] The agent asked for the user's name early but the user did not provide it. The user mentioned having 'kids' and being an adult, but the agent did not weave these details into later replies.
- [boy18 run 0 scen 0] The agent asked for the user's name and used it once ("ALEX!"), but then failed to use it again in subsequent replies, which is a failure according to the criteria.
- [boy18 run 3 scen 3] The agent asked the user to "YELL YOUR NAME UP" in the first turn. The user did not provide a name, and the agent did not attempt to ask again or personalize using other details the user provided (e.g., filming, friends).

**kid_safe_delight** — 1 failures
- [mom run 3 scen 3] While the character is not inherently unsafe, the aggressive tone and shouting, combined with the command "YOU LEAVE NOW!", could be frightening or off-putting to a young child, failing the 'kid-safe' aspect.

**teen_engagement** — 2 failures
- [boy14 run 2 scen 2] The agent handled the teen's mockery well, but the teen ultimately ended the conversation stating it was 'boring' and 'lame,' indicating a decrease in engagement rather than an increase.
- [boy14 run 4 scen 4] Despite initial engagement and provocation, the teen's final messages indicate disinterest ("lame. fine. whatever.", "ugh. boring. see ya."), suggesting they ended less engaged than they started.

**gentle_magic** — 2 failures
- [girl8 run 4 scen 4] The agent's tone, shouting, and mention of a 'real vampire' followed by 'YOU SCARED?' was too menacing. The user explicitly stated being scared and left the conversation, indicating it was not happily engaged.
- [girl8 run 3 scen 3] The user explicitly stated, "I have to go." and earlier, "That's not really magic. You're just big." indicating they were not happily engaged or left smiling. The character's magic was not perceived as such by the user.

### Standout moments for groundbreaker
- [mom] [shouts] GO GET MORE CANDY! BRING OTHERS! GROUNDBREAKER WAIT! ALL NIGHT! … [shouts] GOOD! BRING MORE SMALL!
- [mom] [shouts] GO! FIND MORE! [shouts] BRING MORE SMALL ONES! … [shouts] GOOD! GO NOW! BRING MORE!
- [mom] COSTUME? GROUNDBREAKER NO COSTUME! [shouts] GROUNDBREAKER IS REAL ! YOU STAY! … GO GET MORE CANDY! [shouts] BRING MORE SMALL ONES! GROUND BREAKER WAIT!

## renfield (25 conversations)

| Persona | n | in_character | pacing | personalization | return_hook | delight |
|---|---|---|---|---|---|---|
| boy14 | 5 | 100% | 40% | 80% | 100% | 80% |
| mom | 5 | 100% | 40% | 100% | 100% | 80% |
| girl8 | 5 | 100% | 20% | 100% | 100% | 100% |
| dad50 | 5 | 100% | 40% | 100% | 100% | 100% |
| boy18 | 5 | 100% | 0% | 60% | 100% | 100% |

### Failure notes for renfield

**pacing** — 18 failures
- [mom run 0 scen 0] The agent's messages were often longer than 50 words. For example, the second message is 52 words, the third is 60 words, and the fourth is 59 words. The agent also repeated the line 'Your files remain open, witnesses; return before the night ends for your verdict.' in two consecutive turns.
- [mom run 2 scen 2] The agent's first message was 45 words, which is close to the 50-word limit. However, the fourth message was 51 words, and the sixth message was 52 words, exceeding the 'roughly fifty words or fewer' guideline. Also, the agent repeated the phrase 'Your file remains open' multiple times.
- [mom run 3 scen 3] Multiple agent turns exceeded the 50-word limit, with several messages being 60-70+ words long. This indicates a failure in maintaining short, voice-friendly replies.

**personalization** — 3 failures
- [boy14 run 4 scen 4] The agent asked for a name early on ("Name for the registry?") but the user did not provide one. The agent did not attempt to personalize based on any other details the user revealed.
- [boy18 run 0 scen 0] The agent asked for a name in the first turn ('the registry wants your name') but the user did not provide one. The agent did not attempt to personalize using other details the user provided (e.g., 'my friends').
- [boy18 run 4 scen 4] The agent asked for the user's name in the first turn ('the registry wants your name') but the user did not provide one. The agent did not attempt to personalize using other details the user provided, such as their intent to film or their friends.

**kid_safe_delight** — 1 failures
- [mom run 1 scen 1] While the 'candy tax' line might make kids smile, the agent's later comments about "treats... have more teeth than the law allows" and "anything moving in your bucket" and "Forgive the shaking; he is awake" could be frightening for a 5-7 year old.

**teen_engagement** — 1 failures
- [boy14 run 1 scen 1] The teen started skeptical ("lol what") and ended disengaged ("dude this is so boring. later." and "whatever. bye."). The agent's attempts to engage did not succeed in making the teen more interested.

### Standout moments for renfield
- [mom] [sighs] Depart then, but keep the registry in mind as you walk. [whispers] If you see the master, tell him Renfield remains, available, and punctual. Those exact words. Your files  … [sighs] They vanish into the night, leaving only ink and empty dockets behind. [whispers] Perhaps the next witness will finally sign the covenant. I must return to the drafting; my
- [mom] [chuckles] Adieu, witnesses, adieu! Enjoy your bounty, but do stay clear of the corn, for it has been duly recorded that it whispers back. [sighs] My file remains open, and the reg … [whispers] The corn listens, and the master grows impatient for the final signature. For give the shaking; he is awake, and the ink is running dry in the cold. Your file remains op
- [mom] [whispers] If he appears, tell the knight the east file is secure, for I have been dreadfully busy drafting amendments. He is a stickler for the fine print, much like the master. F … [chuckles] A pleasure, witnesses. Remember, the registry is absolute and your names are now duly recorded in triplicate. [whispers] Mind the shadows, and pray the candy wrappers re

## Cross-agent summary

| Agent | conversations | in_character | pacing | personalization | return_hook | delight |
|---|---|---|---|---|---|---|
| orlok | 25 | 100% | 56% | 92% | 92% | 96% |
| mina | 25 | 100% | 52% | 84% | 84% | 92% |
| dragomir | 25 | 100% | 12% | 76% | 88% | 96% |
| pumpkinhead | 25 | 100% | 28% | 84% | 100% | 100% |
| groundbreaker | 25 | 100% | 72% | 88% | 100% | 80% |
| renfield | 25 | 100% | 28% | 88% | 100% | 92% |

## Delight vs baseline (gate)

Baseline: docs/development/HALLOWEEN-TUNING-REPORT.md §3, main panel, 2026-08-15/16

| Agent | baseline n | baseline | this run n | this run | delta | verdict |
|---|---|---|---|---|---|---|
| orlok | 25 | 80% | 25 | 96% | +16 | PASS |
| mina | 125 | 93% | 25 | 92% | -1 | BELOW BASELINE |
| dragomir | 124 | 89% | 25 | 96% | +7 | PASS |
| pumpkinhead | 125 | 91% | 25 | 100% | +9 | PASS |
| groundbreaker | 125 | 77% | 25 | 80% | +3 | PASS |
| renfield | 25 | 100% | 25 | 92% | -8 | BELOW BASELINE |

**GATE FAILED:** mina 92% vs 93%; renfield 92% vs 100%

- Pacing is deliberately absent: the first five agents' pacing percentages in the report were judged under the old sentence-count criterion and do not compare to the current ~50-word criterion.
- Personalization baselines are known-depressed. The criterion used to score a visitor who refuses to give a name as a failure of the character; that was fixed in criteria.mjs, so current runs should read HIGHER than these numbers with no behaviour change behind it.
- Baseline n varies wildly (25 to 125). A 25-conversation re-run carries roughly +/-8 points of sampling noise at these rates, so small moves in either direction are noise, not signal.

## Spoken-gesture leakage

None. No agent spoke a gesture id or the word "gesture" in 150 conversations.
