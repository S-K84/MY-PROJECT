GOAL:    A visitor who has never been to Taman Indah KLIA knows the three turns to No. 31, Jalan IK 3/3, and recognises the house when they arrive.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps
TIME:    22 s x 30 = 660 frames. No music bed (no music source in this environment); sound effects only.
SOURCE:  WhatsApp video 2026-10-31 21:09 (Google Maps navigation on a phone). Facts taken from it:
         turns into Jalan IK 3/1, Jalan IK 3/6, Jalan IK 3/3, each shown as a right turn; about 410 m and 2 min remaining.
         Destination from the person: No. 31, Jalan IK 3/3, Taman Indah KLIA.
         The map is an ILLUSTRATION, not to scale: street positions are not surveyed, and unnamed streets stay unlabelled.

LOOK:    ground #E9E6DF (map land), lots #D8D2C6, park #C9DDB8, taman streets #FFFFFF 56 px with #CFCAC0 casing,
         main road #F3CF6B 100 px with #DDB24B casing.
         ink #1B1F24, secondary ink #5B6168. Accent #E5482B: route line, car arrow, turn icon, the pin, the target lot. Nothing else.
         Display: Inter 900, 110 px title / 72 px card street, tracking -2%. Body: Inter 700, 40 px.
         Cards: solid #FFFFFF, radius 28, shadow 0 18 40 rgba(27,31,36,0.18). No glass, no gradients.
OBJECTS: terrace-house lots in rows along each street (a taman reads by its rows of lots); a car marker
         (white disc + accent arrow, pointing the way it drives); a map pin with a ground shadow; house No. 31 numbered on its lot.
MOTION:  camera (#map-world x/y/scale, origin 0 0): dive power3.inOut 36 f; follow power1.inOut per street; pull-back power2.inOut 42 f.
         Car and route head share the camera's ease so the car sits still on screen while the map moves.
         Cards enter by a 10 f clip-path wipe from the left, power3.out, then hold still. Pin drops 14 f, bounce.out.
SHOTS:   0-2.4 s    Overview of the taman, title card left: "Ke No. 31" / "Jalan IK 3/3, Taman Indah KLIA". Pin already marks the house. (frame 0 is the thumbnail)
         2.4-3.6 s  Dive to the start on the main road; car appears. whoosh.
         3.6-6.4 s  Drive north on the main road; card 1 "Belok kanan / Jalan IK 3/1" at 4.4; car turns at the junction. pop.
         6.4-10.0 s Drive east on IK 3/1; card 2 "Belok kanan / Jalan IK 3/6" at 8.2. pop.
         10.0-12.4 s Drive south on IK 3/6; card 3 "Belok kanan / Jalan IK 3/3" at 10.8. pop.
         12.4-16.0 s Drive west on IK 3/3 to No. 31; riser into impact as the pin lands at 14.1; card 4 "Sampai / No. 31"; lot fills accent.
         16.0-22.0 s Pull back to the whole route; end card: address, "3 kali belok kanan dari jalan utama", "± 410 m". Holds 4 s.
BANNED:  dark void ground; glow, particles, neon; purple/blue gradients, glass cards; cream paper + serif + mono caps labels;
         everything centred; fade-and-slide-up entrances; text moving while read; corner brackets/HUD; logo in a corner;
         made-up street names or distances not in the source.
QA:      f0 title readable over the overview; f150 card 1 + car at junction; f270 card 2; f345 card 3;
         f450 pin on lot 31 + card 4; f640 end card with whole route visible.
