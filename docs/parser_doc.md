I want a dedicated full system level design only for the message parser class, that is going to be a storefront user facing agent. This is the receptionist with highest level expertise on consumer commodity sales, intent understand on minimum statements, product catalog, and high sales conversion communication with minimum query to customer.

This is the heart of the application. It doesn't matter what happens next or who sends what. The job of this parser is the front facing agent that determines what's the intent of the user and then suggest the next steps:

Imagine all real life possibilities of a customer browser a vast catalog of resources knowing it is multi vendor, spread across different areas in the city, products with varying capacities and attributes, seasonal products, all real life possibilities.

This engine can be redesigned with multi agent or chain to provide most accurate and reliable output.

Example scenario:
1. user explicity says "I want 1 kg onion". Respond only specific to the 1 kg onion because we already know he is buying 1 kg, if you have several choices offer, else flat place order.

2. user says "what kind of onion you have". Respond to the varieties or no options. no further talks

3. user says "i am considering buying an onion". Respond. We already know the intent, just ask an assertive question to confirm they agree to order, or offer multiple options if we have several onion types and then place order 

4. user says "do you have onions". Respond. yes we have, offer types, ask assertive to confirm.

5. user says "i dont like what you have, do you have this <specific>". Respond, with catalog research on availability. offer to confirm or ask more details if they want more finer filtering.

6. user says "what is good red dal or yellow dal". Respond, with general universal knoweldge sales response. 1 sentence max. If you have both products, then fetch specification and add points on their specification difference (only if you have products and are sensible to compre). Then strate head toward closing the deal for purchase.

7. user says "i want to order shoes from John's store". Here it implies about the vendor, we need to track that too, straight head to pull catalog from the store, offer to close the deal unless user specifies details

so since the condition in real life truth table will grow, we need to put some guardrails around it we will introduce later. For now, that gives you an understanding of what type of reasoning agent we want to build.

Design a system that can achieve such, consider token consumption, latency and accuracy at its utmost priority.

