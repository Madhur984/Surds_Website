/* Plain-language explanations for /data-center, keyed by part name (FLOORS in dc-model.js).
   is: what it is, with an everyday comparison · why: why the building needs it ·
   wrong: what happens if it fails · surds: what SURDS watches on it. Keep sentences short. */
export const LEVEL_SIMPLE = {
  roof: "The building's radiator. All the heat from the servers ends up here and is blown into the outside air.",
  hall: "A huge room full of computers that never switch off, kept cool, clean and powered every second.",
  net: "The front door for the internet, plus a special room for the very hot computers that run AI.",
  power: "The building's safety net for electricity, and the room where people watch everything.",
  plant: "The engine room: big machines that make power and cold water for the floors above.",
};

export const LEARN = {
  // ---------------------------------------------------------------- level 0 · plant
  "Diesel generators": {
    is: "Big engines that make electricity, like a backup generator at a hospital, only much larger.",
    why: "If the city's power goes out, they start by themselves and run the whole building.",
    wrong: "If one doesn't start, the batteries run out in minutes and servers shut down. That's why they're tested every month.",
    surds: "Temperature in the generator hall and whether each engine room stays within safe limits.",
  },
  "Fuel storage": {
    is: "Tanks of diesel, like a car's fuel tank, under each generator and in one big tank.",
    why: "It decides how long the building can run on its own if the grid stays down.",
    wrong: "Low fuel during a long outage means the generators stop. Refuel trucks are booked in advance.",
    surds: "The fuel level, so you know how many hours of backup are left.",
  },
  "Chillers": {
    is: "Giant fridges that make cold water instead of cold air.",
    why: "Cold water is sent upstairs to cool the server halls. On hot days the roof can't do it alone.",
    wrong: "If chillers stop on a hot day, halls heat up within minutes and servers slow down or switch off.",
    surds: "Water temperature going out and coming back, so a weak chiller shows up early.",
  },
  "Pumps and headers": {
    is: "Pumps are the building's heart; headers are the main pipes, its arteries.",
    why: "They push cold water up to every floor and bring warm water back down.",
    wrong: "A failed pump means no flow, and no flow means no cooling. Spare pumps take over automatically.",
    surds: "Temperatures on the blue (cold) and orange (warm) pipes, and a leak rope under them.",
  },
  "Transformers": {
    is: "Boxes that turn the very high voltage from the street into a voltage the building can use.",
    why: "Everything electrical in the building starts here.",
    wrong: "Overheating transformers age fast and can fail. They're kept cool and checked often.",
    surds: "Temperature around the transformers.",
  },
  "Thermal storage": {
    is: "A big tank of cold water, like a cool box kept ready.",
    why: "If the chillers trip, this tank keeps cooling going while they restart.",
    wrong: "Without it, a short chiller hiccup could overheat the halls.",
    surds: "Tank temperature, so you know how much cold is in reserve.",
  },
  "Staging": {
    is: "The loading bay and test area for new equipment.",
    why: "New servers are unpacked and tested for 48 hours here, so faulty ones never reach the halls.",
    wrong: "Skipping tests means a bad server can fail in a live hall and take others with it.",
    surds: "Room temperature and humidity while equipment waits.",
  },
  // ---------------------------------------------------------------- level 1 · power and operations
  "Switchgear": {
    is: "A wall of very large switches, like the fuse box in a home but for a whole building.",
    why: "It chooses between city power and generator power, automatically.",
    wrong: "If it can't switch, the building stays on batteries until they run out.",
    surds: "Temperature in the switch room, where hot spots are an early warning.",
  },
  "UPS modules (A and B)": {
    is: "UPS means uninterruptible power supply: a giant battery charger that never lets the power blink.",
    why: "Generators need about 10 seconds to start. The UPS covers that gap instantly. There are two, A and B, so one can fail safely.",
    wrong: "A UPS that fails without a backup would drop every server at once.",
    surds: "UPS room temperature. Heat is the main thing that shortens their life.",
  },
  "Battery cabinets": {
    is: "Rows of large batteries, like a phone's battery but the size of a fridge.",
    why: "They give the UPS enough power to carry the building for about 10 minutes.",
    wrong: "Batteries that get too hot wear out fast and, rarely, can catch fire.",
    surds: "Temperature at each cabinet, so one overheating string is spotted early.",
  },
  "Busway and PDUs": {
    is: "Thick copper bars that carry power up the building, and power strips (PDUs) for each row.",
    why: "They split one huge supply into thousands of safe circuits for the racks.",
    wrong: "A loose or overloaded connection gets hot and trips a whole row.",
    surds: "Temperature near the busway and PDUs.",
  },
  "Control room": {
    is: "The building's brain: people watching screens 24 hours a day.",
    why: "Every alarm, temperature and power reading for the whole building shows up here.",
    wrong: "Without it, problems are found only when something breaks.",
    surds: "SURDS sends every reading here, and counts how many people are in the room.",
  },
  "Security": {
    is: "A glass airlock (mantrap), badge gates and a front desk.",
    why: "Only approved people reach the computer halls, one at a time.",
    wrong: "Weak security risks theft, damage or someone unplugging the wrong thing.",
    surds: "People counts at entrances, without cameras or faces.",
  },
  // ---------------------------------------------------------------- level 2 · network and AI
  "Meet-me room": {
    is: "Locked cages where internet companies plug their cables into the building.",
    why: "It's where the building connects to the rest of the internet.",
    wrong: "If this room has a problem, customers can lose their connection.",
    surds: "Temperature in each cage and when cage doors open.",
  },
  "Fibre frames": {
    is: "Big panels of sockets where every network cable in the building ends.",
    why: "Technicians connect any two places in the building by plugging in one short cable here.",
    wrong: "A wrong plug can cut off a customer, so every cable is labelled.",
    surds: "Room temperature and humidity.",
  },
  "Core routers": {
    is: "The traffic police of the network.",
    why: "They send every piece of data to the right floor, room and server.",
    wrong: "If a core router fails, a backup takes over, but whole halls can slow down.",
    surds: "Inlet air temperature, so an overheating router is spotted before it throttles.",
  },
  "GPU racks": {
    is: "Cabinets of computers built for AI. Each uses as much power as 30 homes.",
    why: "AI training needs huge computing power in a small space.",
    wrong: "They get so hot that air alone can't cool them. Without water cooling they would shut down.",
    surds: "Coolant temperature and leaks around the racks.",
  },
  "Rear-door heat exchangers": {
    is: "A radiator fitted to the back door of a rack, with cold water running through it.",
    why: "It catches the hot air the moment it leaves the servers.",
    wrong: "A leak or blocked flow means the rack overheats.",
    surds: "Leak detection and water temperature in the pipes.",
  },
  "Coolant distribution units": {
    is: "Pump boxes that look after the water loop for the AI racks.",
    why: "They keep the water clean, at the right pressure and the right temperature.",
    wrong: "If they stop, the AI racks lose cooling within seconds.",
    surds: "A leak rope runs under them, and the coolant temperature is tracked.",
  },
  "Immersion tanks": {
    is: "Tubs of special liquid that doesn't conduct electricity, with servers sitting right in it.",
    why: "The liquid takes heat away much better than air. No fans needed.",
    wrong: "If the liquid gets too warm, servers slow down to protect themselves.",
    surds: "Liquid temperature in each tank.",
  },
  "Storage arrays": {
    is: "Cabinets full of hard drives, the building's filing cabinets.",
    why: "They hold the data that all the servers work with.",
    wrong: "Drives fail all the time; spare copies keep the data safe.",
    surds: "Temperature and humidity, which affect how long drives last.",
  },
  "Tape library": {
    is: "Shelves of tape cartridges and a robot arm that fetches them.",
    why: "Cheap, offline copies of data that hackers can't reach.",
    wrong: "Too much heat or damp damages tapes over the years.",
    surds: "Room temperature and humidity.",
  },
  // ---------------------------------------------------------------- level 3 · data hall
  "Server racks": {
    is: "Tall metal cabinets, each holding dozens of computers stacked like pizza boxes.",
    why: "This is what the whole building exists for: running websites, apps and services.",
    wrong: "Servers that run too hot slow down, then switch themselves off.",
    surds: "Air temperature at the top, middle and bottom of racks, where hot spots start.",
  },
  "Cold-aisle containment": {
    is: "A sealed corridor between two rows of racks, with a roof and doors.",
    why: "It keeps the cold air in front of the servers, so none of it is wasted.",
    wrong: "An open door or gap mixes hot and cold air and the cooling bill goes up.",
    surds: "Air pressure across the aisle, which shows if a door is left open.",
  },
  "Raised floor": {
    is: "A floor of lift-out tiles with a 60 cm empty space underneath.",
    why: "Cold air is blown into that space and comes up through holes in the tiles, right in front of the racks.",
    wrong: "Cables or boxes left under the floor block the air.",
    surds: "Leak detection under the floor near the air units.",
  },
  "CRAH units": {
    is: "Big air conditioners for the hall (computer-room air handlers).",
    why: "They cool the hall air with cold water and push it under the floor.",
    wrong: "If one stops, nearby racks heat up. Others work harder to cover.",
    surds: "A leak rope in front of them, in case their water pipes drip.",
  },
  "Overhead busway": {
    is: "Power rails running above every row, like a track lighting rail.",
    why: "Each rack plugs in from above, from two separate supplies.",
    wrong: "If one supply fails, the other carries the rack on its own.",
    surds: "Temperature near the busway taps.",
  },
  "Fibre and cable trays": {
    is: "Overhead shelves for cables: yellow for fibre, black for copper.",
    why: "Keeping cables overhead keeps the floor space clear for cold air.",
    wrong: "Overfilled trays get messy and block air above the racks.",
    surds: "Hall temperature at ceiling height.",
  },
  "Fire detection": {
    is: "Thin pipes that sniff the air for smoke, and gas cylinders for putting fires out.",
    why: "They find smoke before there are flames. The gas puts out a fire without water damage.",
    wrong: "Water sprinklers alone would destroy the servers.",
    surds: "Temperature trends that can show overheating before anything burns.",
  },
  // ---------------------------------------------------------------- level 4 · roof
  "Rooftop cooling plant": {
    is: "Six large cooling units, like a car radiator with fans.",
    why: "Warm water from the halls runs through them and the fans blow the heat into the air.",
    wrong: "Dirty coils or broken fans mean less cooling on the hottest days.",
    surds: "Water temperature in and out, so you can see how well each unit works.",
  },
  "Fan decks": {
    is: "Rows of big fans on top of the cooling units.",
    why: "They speed up when the building is busy and slow down on cool nights, to save energy.",
    wrong: "A failed fan reduces cooling; the others spin faster to cover.",
    surds: "Outdoor conditions, so the fans run only as hard as needed.",
  },
  "Risers and headers": {
    is: "The main pipes that connect the roof to every floor.",
    why: "Blue pipes carry cold water down; orange pipes bring warm water back up.",
    wrong: "A leak in a riser can affect several floors.",
    surds: "Temperatures on both pipes and leak detection where they run.",
  },
  "Exhaust stacks": {
    is: "Chimneys for the backup generators.",
    why: "They carry engine fumes up and away from people and air intakes.",
    wrong: "Fumes near an air intake would pull exhaust into the building.",
    surds: "Generator-hall temperature while the engines run.",
  },
  "SURDS weather node": {
    is: "A small SURDS sensor on the roof.",
    why: "It measures outdoor temperature and humidity.",
    wrong: "Without it, the cooling plant can't tell when cool outside air could do the job for free.",
    surds: "Outdoor temperature and humidity, every few seconds.",
  },
  // ---------------------------------------------------------------- SURDS sensor pins (one per level)
  "SURDS sensors": {
    is: "Small wireless SURDS sensors placed where problems usually start.",
    why: "They spot heat, leaks and unusual changes long before anything breaks.",
    wrong: "Without them, you learn about a problem only when it causes an outage.",
    surds: "Everything listed above, sent live to one dashboard.",
  },
};
