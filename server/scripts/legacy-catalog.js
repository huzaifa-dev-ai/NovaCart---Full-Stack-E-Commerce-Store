/* =============================================================
   NovaCart — Product Data
   -------------------------------------------------------------
   For now the catalog lives here as a static array so the UI can
   be built and tested standalone. When the backend is added, only
   NovaCart.getProducts() changes — it will fetch("/api/products")
   instead. Nothing in the UI layer needs to be rewritten.

   Card grids use `shortDescription`; the details page uses the
   fuller `description` plus the `features` highlights.
   ============================================================= */

window.NovaCart = window.NovaCart || {};

(function (App) {
  "use strict";

  var PRODUCTS = [
    {
      id: 1,
      featured: true,
      name: "Aurora Wireless Headphones",
      category: "Audio",
      price: 129.99,
      oldPrice: 169.99,
      image: "assets/images/products/headphones.jpg",
      shortDescription: "Over-ear headphones with active noise cancelling and 40-hour battery life.",
      description:
        "The Aurora wraps studio-grade sound in a feather-light over-ear build you can wear all day. " +
        "Hybrid active noise cancelling silences commutes and open offices, while the 40-hour battery " +
        "outlasts even your longest week. Fold them flat, drop them in the included case, and go.",
      features: [
        "Hybrid active noise cancelling with transparency mode",
        "40-hour battery — 5-minute charge adds 4 hours",
        "Memory-foam earcups with folding aluminium frame",
        "Bluetooth 5.3 with multipoint pairing"
      ],
      rating: 4.8,
      reviews: 214,
      stock: 18,
      badge: "Sale"
    },
    {
      id: 2,
      featured: true,
      name: "Pulse Smart Watch",
      category: "Wearables",
      price: 199.0,
      oldPrice: null,
      image: "assets/images/products/smartwatch.jpg",
      shortDescription: "Track workouts, sleep and heart rate on a crisp always-on AMOLED display.",
      description:
        "Pulse keeps the essentials on your wrist and the noise out of your day. A bright always-on " +
        "AMOLED display, week-long battery, and precise heart-rate, sleep and workout tracking across " +
        "120+ sport modes — all in a water-resistant case that goes from gym to dinner.",
      features: [
        "1.4″ always-on AMOLED display",
        "7-day battery life with magnetic fast charging",
        "Heart rate, SpO2, sleep and stress tracking",
        "5 ATM water resistance with swim tracking"
      ],
      rating: 4.6,
      reviews: 168,
      stock: 25,
      badge: "New"
    },
    {
      id: 3,
      featured: true,
      name: "Nomad Everyday Backpack",
      category: "Bags",
      price: 74.5,
      oldPrice: 89.0,
      image: "assets/images/products/backpack.jpg",
      shortDescription: "Water-resistant 22L pack with a padded laptop sleeve and hidden pockets.",
      description:
        "The Nomad is the one bag that handles the office, the gym and a weekend away. Its 22-litre " +
        "main compartment opens flat for easy packing, a padded sleeve protects laptops up to 16″, " +
        "and the water-resistant shell with storm-sealed zips shrugs off real weather.",
      features: [
        "22L capacity with clamshell opening",
        "Padded sleeve fits laptops up to 16″",
        "Water-resistant shell and storm-sealed zips",
        "Hidden anti-theft pocket and luggage pass-through"
      ],
      rating: 4.7,
      reviews: 96,
      stock: 12,
      badge: "Sale"
    },
    {
      id: 4,
      featured: true,
      name: "Solstice Polarized Sunglasses",
      category: "Accessories",
      price: 59.99,
      oldPrice: null,
      image: "assets/images/products/sunglasses.jpg",
      shortDescription: "UV400 polarized lenses in a lightweight acetate frame built to last.",
      description:
        "Solstice pairs timeless wayfarer lines with modern optics. Polarized UV400 lenses cut glare " +
        "on the road and on the water, while the hand-polished acetate frame with spring hinges stays " +
        "comfortable from first coffee to last light. Includes a hard case and microfibre cloth.",
      features: [
        "Polarized UV400 lenses cut reflected glare",
        "Hand-polished acetate frame with spring hinges",
        "Scratch-resistant coating on both lens faces",
        "Hard case and cleaning cloth included"
      ],
      rating: 4.4,
      reviews: 73,
      stock: 40,
      badge: null
    },
    {
      id: 5,
      featured: true,
      name: "Vertex Mirrorless Camera",
      category: "Photography",
      price: 649.0,
      oldPrice: 729.0,
      image: "assets/images/products/camera.jpg",
      shortDescription: "24MP sensor, 4K video and dual card slots in a compact travel-ready body.",
      description:
        "The Vertex puts serious imaging in a body that disappears into a jacket pocket. A 24MP " +
        "APS-C sensor and fast hybrid autofocus nail the moment, 4K/30 video handles the b-roll, and " +
        "dual card slots plus a weather-sealed magnesium shell make it a dependable travel companion.",
      features: [
        "24MP APS-C sensor with 5-axis stabilisation",
        "4K/30 video and clean HDMI out",
        "Hybrid AF with eye and subject tracking",
        "Dual SD slots in a weather-sealed body"
      ],
      rating: 4.9,
      reviews: 312,
      stock: 6,
      badge: "Sale"
    },
    {
      id: 6,
      featured: true,
      name: "Cadence Mechanical Keyboard",
      category: "Computing",
      price: 109.0,
      oldPrice: null,
      image: "assets/images/products/keyboard.jpg",
      shortDescription: "Hot-swappable switches, per-key backlight and a solid aluminium frame.",
      description:
        "Cadence is built for people who notice the difference. Hot-swappable switches let you tune " +
        "the feel without a soldering iron, the gasket-mounted aluminium frame keeps every keystroke " +
        "solid and quiet, and per-key backlighting with wireless or USB-C keeps your desk clean.",
      features: [
        "Hot-swappable switches — no soldering required",
        "Gasket-mounted CNC aluminium frame",
        "Per-key RGB backlight with onboard profiles",
        "Bluetooth, 2.4GHz wireless or wired USB-C"
      ],
      rating: 4.7,
      reviews: 189,
      stock: 22,
      badge: "New"
    },
    {
      id: 7,
      featured: true,
      name: "Drift Running Sneakers",
      category: "Footwear",
      price: 89.95,
      oldPrice: null,
      image: "assets/images/products/sneakers.jpg",
      shortDescription: "Breathable knit upper with responsive foam cushioning for daily miles.",
      description:
        "Drift is the daily trainer that never asks for a day off. A seamless knit upper keeps feet " +
        "cool and blister-free, responsive foam returns energy mile after mile, and the durable rubber " +
        "outsole grips wet pavement with confidence. Light enough for tempo days, cushioned enough for long ones.",
      features: [
        "Seamless breathable knit upper",
        "Responsive foam midsole with 8mm drop",
        "High-abrasion rubber outsole, wet-grip pattern",
        "Reflective details for low-light runs"
      ],
      rating: 4.5,
      reviews: 141,
      stock: 0,
      badge: null
    },
    {
      id: 8,
      featured: true,
      name: "Lumen Desk Lamp",
      category: "Home",
      price: 44.0,
      oldPrice: 55.0,
      image: "assets/images/products/lamp.jpg",
      shortDescription: "Adjustable arm with three colour temperatures and a USB charging port.",
      description:
        "Lumen gives your desk the light it deserves. Three colour temperatures move from crisp " +
        "focus white to a warm evening glow, the double-hinged arm puts light exactly where you need " +
        "it, and the built-in USB port tops up your phone while you work. Flicker-free and easy on the eyes.",
      features: [
        "Three colour temperatures, stepless dimming",
        "Double-hinged arm with 180° rotating head",
        "Flicker-free, eye-safe LED panel",
        "Built-in USB-A charging port in the base"
      ],
      rating: 4.3,
      reviews: 58,
      stock: 31,
      badge: "Sale"
    },
    {
      id: 9,
      name: "Nova Buds Pro Earbuds",
      category: "Audio",
      price: 79.99,
      oldPrice: 99.99,
      image: "assets/images/products/nova-buds-pro.jpg",
      shortDescription: "True wireless earbuds with hybrid noise cancelling and 32-hour total battery life.",
      description:
        "Nova Buds Pro are for commutes that deserve better sound. Hybrid active noise cancelling shuts out the carriage rumble, 10mm drivers keep the low end warm without smearing the mids, and a transparency mode lets the platform announcements through when you need them. The charging case adds three full top-ups and a fifteen-minute charge buys two hours of listening.",
      features: ["Hybrid ANC with adjustable transparency mode", "10mm dynamic drivers tuned for warm mids", "8 hours per charge, 32 with the case", "IPX5 rated with USB-C and wireless charging"],
      rating: 4.5,
      reviews: 342,
      stock: 34,
      badge: "Sale"
    },
    {
      id: 10,
      name: "Echo Mini Bluetooth Speaker",
      category: "Audio",
      price: 39.99,
      oldPrice: null,
      image: "assets/images/products/echo-mini-speaker.jpg",
      shortDescription: "Palm-sized Bluetooth speaker with 12-hour battery life and IPX7 waterproofing.",
      description:
        "Echo Mini proves a speaker this small has no business sounding this big. A 48mm full-range driver and passive radiator dig out real bass, IPX7 waterproofing shrugs off pool splashes, and two units pair up for proper stereo. Twelve hours of playback covers a full day out on one USB-C charge.",
      features: ["48mm driver with passive bass radiator", "IPX7 waterproof — survives full submersion", "12-hour battery, charges over USB-C", "Stereo pairing with a second unit"],
      rating: 4.4,
      reviews: 371,
      stock: 42,
      badge: null
    },
    {
      id: 11,
      name: "Wavecast USB Studio Microphone",
      category: "Audio",
      price: 89.0,
      oldPrice: null,
      image: "assets/images/products/wavecast-mic.jpg",
      shortDescription: "Cardioid USB condenser microphone with onboard gain control and zero-latency monitoring.",
      description:
        "Wavecast makes your voice the clearest thing in the call, stream, or take. A 25mm condenser capsule records at 24-bit/96kHz, the cardioid pattern rejects the keyboard clatter behind you, and a tap-to-mute pad with zero-latency headphone monitoring keeps you in control. It sits on the included desk stand or threads straight onto a boom arm.",
      features: ["25mm condenser capsule, 24-bit/96kHz", "Cardioid pattern rejects off-axis noise", "Tap-to-mute with zero-latency monitoring", "Desk stand included, standard boom thread"],
      rating: 4.6,
      reviews: 218,
      stock: 19,
      badge: "New"
    },
    {
      id: 12,
      name: "Retrospin Bluetooth Turntable",
      category: "Audio",
      price: 149.0,
      oldPrice: 179.0,
      image: "assets/images/products/retrospin-turntable.jpg",
      shortDescription: "Belt-drive turntable with Bluetooth output, built-in phono preamp, and USB recording.",
      description:
        "Retrospin treats your records with more respect than its price suggests. A belt-driven aluminium platter and adjustable counterweight keep tracking accurate, the built-in phono preamp plugs into any powered speaker, and Bluetooth streams your vinyl to the kit you already own. A USB output digitises your collection when you want copies for the road.",
      features: ["Belt drive with aluminium platter", "Adjustable counterweight and anti-skate", "Built-in switchable phono preamp", "Bluetooth output plus USB recording"],
      rating: 4.3,
      reviews: 164,
      stock: 9,
      badge: "Sale"
    },
    {
      id: 13,
      name: "CinemaBar 2.1 Soundbar",
      category: "Audio",
      price: 199.0,
      oldPrice: 249.0,
      image: "assets/images/products/cinemabar-soundbar.jpg",
      shortDescription: "2.1-channel soundbar with wireless subwoofer, HDMI ARC, and a dedicated dialogue mode.",
      description:
        "CinemaBar exists because TV speakers ruin good films. Three driver pairs and a wireless subwoofer put weight behind every scene, a dedicated dialogue mode lifts voices out of the mix, and HDMI ARC means one cable and one remote. Bluetooth turns it into the living-room music system between films.",
      features: ["Wireless subwoofer with 5.25-inch driver", "HDMI ARC — one cable, one remote", "Dialogue mode lifts voices from the mix", "Bluetooth streaming for music playback"],
      rating: 4.5,
      reviews: 287,
      stock: 14,
      badge: "Sale"
    },
    {
      id: 14,
      name: "Raid Pro Gaming Headset",
      category: "Audio",
      price: 69.99,
      oldPrice: null,
      image: "assets/images/products/raid-gaming-headset.jpg",
      shortDescription: "Wired gaming headset with 50mm drivers, detachable boom mic, and memory-foam earcups.",
      description:
        "Raid Pro is built for the sessions that run past midnight. 50mm drivers place footsteps precisely, the detachable boom mic passes broadcast-clean comms, and memory-foam earcups under a suspended headband stay comfortable long after the third overtime. It plugs into anything with a 3.5mm jack, console or PC alike.",
      features: ["50mm drivers tuned for positional audio", "Detachable noise-cancelling boom microphone", "Memory-foam earcups, suspended headband", "3.5mm connection for PC and console"],
      rating: 4.2,
      reviews: 356,
      stock: 27,
      badge: null
    },
    {
      id: 15,
      name: "Heritage Retro Radio",
      category: "Audio",
      price: 54.0,
      oldPrice: null,
      image: "assets/images/products/heritage-radio.jpg",
      shortDescription: "FM and DAB tabletop radio with Bluetooth streaming in a walnut-finish wooden cabinet.",
      description:
        "Heritage looks like it belongs in a kitchen photograph from 1962 and streams like it was made this year. A 3-inch full-range driver in a tuned wooden cabinet gives voices their warmth back, DAB and FM cover the airwaves, and Bluetooth handles everything the airwaves don't. The rotary dials do exactly what rotary dials should.",
      features: ["DAB, DAB+ and FM reception", "Bluetooth streaming from any phone", "3-inch driver in tuned wooden cabinet", "Analogue rotary tuning and volume dials"],
      rating: 4.7,
      reviews: 193,
      stock: 21,
      badge: null
    },
    {
      id: 16,
      name: "Reference Duo Studio Monitors",
      category: "Audio",
      price: 229.0,
      oldPrice: null,
      image: "assets/images/products/reference-monitors.jpg",
      shortDescription: "Powered 4-inch studio monitor pair with bi-amped drivers and rear acoustic tuning switches.",
      description:
        "Reference Duo tells you the truth about your mix. Bi-amped 4-inch woofers and silk-dome tweeters stay flat where hype speakers flatter, rear tuning switches adapt the pair to your desk and room, and balanced TRS joins RCA and aux inputs on the back panel. Fifty watts a side is more than a small room will ever ask for.",
      features: ["Bi-amped: 4-inch woofer, silk-dome tweeter", "Flat response voiced for honest mixing", "Rear acoustic tuning for desk placement", "Balanced TRS, RCA and aux inputs"],
      rating: 4.6,
      reviews: 127,
      stock: 11,
      badge: "New"
    },
    {
      id: 17,
      name: "Stride Fitness Tracker",
      category: "Wearables",
      price: 49.99,
      oldPrice: 69.99,
      image: "assets/images/products/stride-fitness-band.jpg",
      shortDescription: "Slim fitness band with continuous heart-rate and sleep tracking and a 10-day battery.",
      description:
        "Stride keeps score so you don't have to. Continuous heart-rate and sleep tracking feed a readiness picture each morning, fourteen sport modes cover everything from intervals to laps, and 5ATM water resistance means the pool counts too. Ten days between charges makes it easy to forget the cable exists.",
      features: ["24/7 heart-rate and sleep tracking", "14 sport modes with auto-detection", "5ATM water resistance, swim-ready", "10-day battery on a single charge"],
      rating: 4.3,
      reviews: 368,
      stock: 38,
      badge: "Sale"
    },
    {
      id: 18,
      name: "Portal VR Headset",
      category: "Wearables",
      price: 349.0,
      oldPrice: null,
      image: "assets/images/products/portal-vr.jpg",
      shortDescription: "Standalone VR headset with 4K combined resolution and inside-out room tracking.",
      description:
        "Portal drops you somewhere else without a PC or a wire in sight. Twin fast-switch LCDs deliver 4K combined resolution at 90Hz, inside-out tracking maps your room through four wide-angle cameras, and the touch controllers translate every gesture. A balanced strap and 128GB of onboard storage keep long sessions comfortable and stocked.",
      features: ["4K combined resolution at 90Hz", "Inside-out tracking, no base stations", "Touch controllers with haptic feedback", "128GB storage, fully standalone"],
      rating: 4.5,
      reviews: 142,
      stock: 8,
      badge: "New"
    },
    {
      id: 19,
      name: "Orbit Smart Ring",
      category: "Wearables",
      price: 199.0,
      oldPrice: null,
      image: "assets/images/products/orbit-smart-ring.jpg",
      shortDescription: "Titanium smart ring tracking sleep, heart rate, and recovery for up to six days per charge.",
      description:
        "Orbit tracks your health from the one place you'll never feel it. Sensors against the finger read heart rate, temperature, and blood oxygen through the night, the app turns them into a plain-language readiness score each morning, and there is no screen to charge away your attention. The titanium shell weighs under four grams and runs six days per charge.",
      features: ["Heart rate, SpO2 and temperature sensors", "Sleep staging with morning readiness score", "Titanium shell weighing under four grams", "6-day battery with compact charging cradle"],
      rating: 4.4,
      reviews: 116,
      stock: 16,
      badge: "New"
    },
    {
      id: 20,
      name: "Zenith 14 Ultrabook",
      category: "Computing",
      price: 999.0,
      oldPrice: 1099.0,
      image: "assets/images/products/zenith-ultrabook.jpg",
      shortDescription: "1.2kg ultrabook with a 2.8K OLED display, 16GB of memory, and all-day battery life.",
      description:
        "Zenith 14 is the laptop you stop thinking about and just carry. The 2.8K OLED panel makes text look printed, sixteen gigabytes of memory and a fast NVMe drive keep thirty browser tabs honest, and the magnesium chassis lands at 1.2 kilograms. Fourteen hours of battery and fast charging over USB-C get you through the day and most of the next.",
      features: ["14-inch 2.8K OLED at 90Hz", "16GB RAM, 512GB NVMe storage", "1.2kg magnesium alloy chassis", "14-hour battery, USB-C fast charge"],
      rating: 4.6,
      reviews: 98,
      stock: 7,
      badge: "Sale"
    },
    {
      id: 21,
      name: "Vista 34 Ultrawide Monitor",
      category: "Computing",
      price: 429.0,
      oldPrice: null,
      image: "assets/images/products/vista-ultrawide.jpg",
      shortDescription: "34-inch curved ultrawide with 1440p resolution, 144Hz refresh, and USB-C connectivity.",
      description:
        "Vista 34 replaces two monitors and the seam between them. The 3440x1440 VA panel curves gently around your sightline, 144Hz with adaptive sync keeps motion clean whether you're gaming or scrubbing timelines, and a single USB-C cable carries video and 65W of laptop charging. Picture-by-picture splits it back into two inputs when you need both machines up.",
      features: ["34-inch 3440x1440 curved VA panel", "144Hz refresh with adaptive sync", "USB-C with 65W laptop charging", "Picture-by-picture dual-input mode"],
      rating: 4.5,
      reviews: 154,
      stock: 12,
      badge: null
    },
    {
      id: 22,
      name: "Glide Wireless Mouse",
      category: "Computing",
      price: 49.0,
      oldPrice: null,
      image: "assets/images/products/glide-wireless-mouse.jpg",
      shortDescription: "Low-profile wireless mouse with silent switches and a 90-day rechargeable battery.",
      description:
        "Glide is the mouse your wrist stops complaining about. A contoured low-profile shell keeps your hand in a neutral rest, silent switches spare the open-plan office, and the 4000 DPI sensor tracks on glass and wood alike. It pairs to three devices over Bluetooth or the 2.4GHz dongle and runs ninety days per USB-C charge.",
      features: ["Silent switches rated for 10 million clicks", "4000 DPI sensor tracks on glass", "Pairs to 3 devices, Bluetooth or 2.4GHz", "90-day battery, recharges over USB-C"],
      rating: 4.4,
      reviews: 329,
      stock: 44,
      badge: null
    },
    {
      id: 23,
      name: "Clarity 4K Webcam",
      category: "Computing",
      price: 119.0,
      oldPrice: null,
      image: "assets/images/products/clarity-webcam.jpg",
      shortDescription: "4K webcam with a large low-light sensor, auto-framing, and dual noise-reducing microphones.",
      description:
        "Clarity ends the era of looking worse than you sound. A large 4K sensor holds detail in bad home-office light, auto-framing keeps you centred when you lean and gesture, and dual microphones cut the dishwasher out of your audio. A physical privacy shutter and a standard tripod thread round out the practical bits.",
      features: ["4K30 capture with large low-light sensor", "Auto-framing keeps you centred", "Dual microphones with noise reduction", "Privacy shutter and tripod thread"],
      rating: 4.3,
      reviews: 201,
      stock: 23,
      badge: null
    },
    {
      id: 24,
      name: "Elevate Laptop Stand",
      category: "Computing",
      price: 39.0,
      oldPrice: 49.0,
      image: "assets/images/products/elevate-laptop-stand.jpg",
      shortDescription: "Adjustable aluminium laptop stand that raises your screen to eye level with open airflow.",
      description:
        "Elevate fixes your posture before your physio has to. Six height positions bring the screen up to eye level, the single-piece aluminium arm stays rigid under heavy typing, and the open frame keeps air moving under hot machines. It folds flat, weighs 800 grams, and slips into the same sleeve as your laptop.",
      features: ["Six height settings up to 15cm of lift", "Single-piece aluminium arm, no wobble", "Open frame improves laptop cooling", "Folds flat at 800g for travel"],
      rating: 4.7,
      reviews: 344,
      stock: 31,
      badge: "Sale"
    },
    {
      id: 25,
      name: "Nexus 8-in-1 USB-C Hub",
      category: "Computing",
      price: 59.99,
      oldPrice: null,
      image: "assets/images/products/nexus-usb-hub.jpg",
      shortDescription: "8-in-1 USB-C hub with 4K HDMI, gigabit Ethernet, and 100W pass-through charging.",
      description:
        "Nexus turns one port into a full desk. 4K60 HDMI, gigabit Ethernet, two USB-A ports and SD and microSD readers cover the daily essentials, while 100W pass-through keeps your laptop charging over the same cable. The aluminium shell doubles as a heatsink so sustained transfers don't throttle.",
      features: ["4K60 HDMI output", "Gigabit Ethernet and two USB-A 3.2 ports", "SD and microSD card readers", "100W USB-C pass-through charging"],
      rating: 4.5,
      reviews: 312,
      stock: 36,
      badge: null
    },
    {
      id: 26,
      name: "SketchPad Drawing Tablet",
      category: "Computing",
      price: 89.0,
      oldPrice: null,
      image: "assets/images/products/sketchpad-tablet.jpg",
      shortDescription: "10-inch drawing tablet with 8192 pressure levels and a battery-free tilt-aware pen.",
      description:
        "SketchPad gets out of the way between your hand and the canvas. The battery-free pen reads 8192 pressure levels and 60 degrees of tilt, the 10x6-inch textured surface drags like real paper, and eight programmable keys keep undo and zoom under your off hand. It connects over USB-C and works with every major art application.",
      features: ["8192 pressure levels with tilt support", "Battery-free pen with two side buttons", "10x6-inch paper-textured active area", "8 shortcut keys, USB-C connection"],
      rating: 4.4,
      reviews: 187,
      stock: 17,
      badge: null
    },
    {
      id: 27,
      name: "Slate 11 Tablet",
      category: "Computing",
      price: 449.0,
      oldPrice: 499.0,
      image: "assets/images/products/slate-tablet.jpg",
      shortDescription: "11-inch tablet with a 120Hz 2K display, quad speakers, and low-latency stylus support.",
      description:
        "Slate 11 is the tablet that earns a place beside your laptop rather than under it. The 2K display refreshes at 120Hz so sketching and scrolling feel immediate, quad speakers make it a legitimate small cinema, and the low-latency stylus and keyboard cover attach magnetically. Ten hours of mixed use and 128GB of storage handle a full working day.",
      features: ["11-inch 2K display at 120Hz", "Quad speakers with spatial tuning", "Magnetic stylus and keyboard cover support", "128GB storage, 10-hour battery"],
      rating: 4.5,
      reviews: 173,
      stock: 13,
      badge: "Sale"
    },
    {
      id: 28,
      name: "Vista Go Portable Monitor",
      category: "Computing",
      price: 179.0,
      oldPrice: null,
      image: "assets/images/products/vista-portable-monitor.jpg",
      shortDescription: "15.6-inch 1080p portable monitor drawing power and video from one USB-C cable.",
      description:
        "Vista Go gives your laptop a second screen wherever you open it. The 15.6-inch IPS panel matches your main display at 1080p, one USB-C cable carries power and picture both, and mini-HDMI covers consoles and cameras. It weighs 730 grams, and the folding cover props it at two angles and protects it in transit.",
      features: ["15.6-inch 1080p IPS panel", "Single-cable USB-C power and video", "Mini-HDMI input for consoles and cameras", "730g with folding stand cover"],
      rating: 4.4,
      reviews: 226,
      stock: 15,
      badge: "New"
    },
    {
      id: 29,
      name: "Skyline 4K Drone",
      category: "Photography",
      price: 499.0,
      oldPrice: 599.0,
      image: "assets/images/products/skyline-drone.jpg",
      shortDescription: "Foldable 4K drone with a 3-axis gimbal, 34-minute flights, and 8km transmission range.",
      description:
        "Skyline puts a stabilised camera anywhere you can point at the sky. The 3-axis gimbal holds 4K30 footage steady in a crosswind, GPS return-to-home and downward obstacle sensing look after the aircraft, and each battery is good for 34 minutes aloft. Folded, it is smaller than a water bottle and weighs under 249 grams.",
      features: ["4K30 camera on 3-axis gimbal", "34-minute flight time per battery", "8km transmission with live HD feed", "Under 249g, folds to bottle size"],
      rating: 4.6,
      reviews: 89,
      stock: 6,
      badge: "Sale"
    },
    {
      id: 30,
      name: "Venture Action Camera",
      category: "Photography",
      price: 249.0,
      oldPrice: null,
      image: "assets/images/products/venture-action-cam.jpg",
      shortDescription: "Waterproof 5K action camera with horizon-locking stabilisation and dual touchscreens.",
      description:
        "Venture is built for the moments you can't ask to repeat. 5K30 capture leaves room to crop, horizon-locking stabilisation keeps the ride watchable however the mount shakes, and front and rear touchscreens make framing yourself simple. It is waterproof to ten metres without a case and swaps batteries in seconds.",
      features: ["5K30 video and 20MP stills", "Horizon-locking image stabilisation", "Waterproof to 10m without a housing", "Front and rear touch displays"],
      rating: 4.5,
      reviews: 158,
      stock: 18,
      badge: null
    },
    {
      id: 31,
      name: "Anchor Carbon Tripod",
      category: "Photography",
      price: 129.0,
      oldPrice: null,
      image: "assets/images/products/anchor-tripod.jpg",
      shortDescription: "Carbon-fibre travel tripod that folds to 42cm and supports 8kg of camera kit.",
      description:
        "Anchor holds still so your long exposures can. Carbon-fibre legs cut the weight to 1.1 kilograms without giving up an 8-kilogram load rating, twist locks deploy all four sections in seconds, and the ball head pans smoothly on a standard quick-release plate. A hook under the centre column takes ballast when the wind picks up.",
      features: ["Carbon-fibre legs, 1.1kg total weight", "8kg load rating, 42cm folded length", "Ball head with standard quick-release plate", "Centre-column hook for ballast weight"],
      rating: 4.7,
      reviews: 104,
      stock: 22,
      badge: null
    },
    {
      id: 32,
      name: "Prime 50mm f/1.8 Lens",
      category: "Photography",
      price: 219.0,
      oldPrice: null,
      image: "assets/images/products/prime-lens-50.jpg",
      shortDescription: "Fast 50mm f/1.8 prime with silent autofocus and a seven-blade rounded aperture.",
      description:
        "Prime 50mm is the lens that teaches you what your camera can actually do. The f/1.8 aperture pulls subjects off creamy backgrounds and keeps shutter speeds up after sunset, a stepping autofocus motor works fast and silently for video, and the seven-blade rounded diaphragm keeps highlights round. At 160 grams it stays on the camera and in the bag.",
      features: ["Bright f/1.8 maximum aperture", "Silent stepping autofocus motor", "Seven rounded aperture blades", "160g — a true everyday carry"],
      rating: 4.8,
      reviews: 246,
      stock: 9,
      badge: null
    },
    {
      id: 33,
      name: "Flash Instant Camera",
      category: "Photography",
      price: 99.0,
      oldPrice: 119.0,
      image: "assets/images/products/flash-instant-camera.jpg",
      shortDescription: "Point-and-shoot instant camera that prints credit-card photos in under 90 seconds.",
      description:
        "Flash brings the print back into the picture. Auto exposure and a built-in selfie mirror get the shot right the first time, the rechargeable battery covers about 100 prints per charge, and a macro mode handles close-ups down to 30 cm. Slide the film pack in, press the shutter, and hand someone a photo they can keep.",
      features: ["Prints credit-card-size photos in about 90 seconds", "Auto exposure with built-in fill flash", "Rechargeable battery rated for roughly 100 prints", "Selfie mirror and 30 cm macro mode"],
      rating: 4.5,
      reviews: 210,
      stock: 26,
      badge: "Sale"
    },
    {
      id: 34,
      name: "Halo Ring Light Kit",
      category: "Photography",
      price: 45.0,
      oldPrice: null,
      image: "assets/images/products/halo-ring-light.jpg",
      shortDescription: "10-inch ring light with extendable tripod, phone mount and three colour temperature modes.",
      description:
        "Halo makes every call and clip look deliberately lit. Three colour modes from warm 3000K to daylight 6500K with 10 brightness steps dial in the exact look, and the tripod extends to 160 cm with a ball-head phone mount that rotates a full 360 degrees. USB power means it runs off a laptop, a power bank or the wall.",
      features: ["10-inch LED ring with 3000K-6500K range", "10 brightness levels via in-line remote", "Tripod extends from 40 cm to 160 cm", "360-degree phone mount fits most cases"],
      rating: 4.4,
      reviews: 340,
      stock: 33,
      badge: null
    },
    {
      id: 35,
      name: "Apex Wireless Controller",
      category: "Gaming",
      price: 64.99,
      oldPrice: null,
      image: "assets/images/products/apex-controller.jpg",
      shortDescription: "Low-latency wireless controller with hall-effect sticks and remappable back buttons.",
      description:
        "Apex is the controller you stop thinking about mid-match. Hall-effect thumbsticks eliminate drift for good, two remappable back buttons keep your thumbs on the sticks, and the 2.4GHz link holds latency under 8 ms across PC and mobile. A 20-hour battery with USB-C fast charging means it outlasts the session.",
      features: ["Drift-free hall-effect thumbsticks and triggers", "Two remappable rear buttons with onboard profiles", "2.4GHz wireless under 8 ms, plus Bluetooth and USB-C", "20-hour battery with 15-minute quick charge"],
      rating: 4.6,
      reviews: 265,
      stock: 29,
      badge: null
    },
    {
      id: 36,
      name: "Viper RGB Gaming Mouse",
      category: "Gaming",
      price: 59.0,
      oldPrice: 79.0,
      image: "assets/images/products/viper-gaming-mouse.jpg",
      shortDescription: "Lightweight 26,000 DPI gaming mouse with optical switches and eight programmable buttons.",
      description:
        "Viper is built for flicks that land. A 26,000 DPI optical sensor tracks at 650 IPS, optical switches fire in 0.2 ms without double-click wear, and the 58-gram shell keeps long sessions light on the wrist. Onboard memory stores five profiles so your settings follow you to any machine.",
      features: ["26,000 DPI optical sensor with 650 IPS tracking", "0.2 ms optical switches rated for 90 million clicks", "58-gram shell with PTFE glide feet", "Eight programmable buttons, five onboard profiles"],
      rating: 4.5,
      reviews: 310,
      stock: 35,
      badge: "Sale"
    },
    {
      id: 37,
      name: "Throne Ergonomic Gaming Chair",
      category: "Gaming",
      price: 289.0,
      oldPrice: 349.0,
      image: "assets/images/products/throne-gaming-chair.jpg",
      shortDescription: "Ergonomic gaming chair with 4D armrests, adjustable lumbar and a 165-degree recline.",
      description:
        "Throne is built for the eighth hour, not the first. Adjustable lumbar support and a cold-cure foam seat hold posture through long sessions, while 4D armrests, a 165-degree recline and a class-4 gas lift adjust to any desk and any break. The steel frame is rated to 150 kg and covered by a five-year warranty.",
      features: ["Adjustable lumbar support with cold-cure foam seat", "4D armrests and 165-degree recline with tilt lock", "Class-4 gas lift on a 150 kg rated steel frame", "Breathable PU covering with removable neck pillow"],
      rating: 4.3,
      reviews: 120,
      stock: 5,
      badge: "Sale"
    },
    {
      id: 38,
      name: "Grid XL RGB Mousepad",
      category: "Gaming",
      price: 34.99,
      oldPrice: null,
      image: "assets/images/products/grid-rgb-mousepad.jpg",
      shortDescription: "900 x 400 mm desk-size mousepad with 14-zone edge lighting and a non-slip rubber base.",
      description:
        "Grid turns the whole desk into playing surface. The 900 x 400 mm micro-woven cloth is tuned for both speed and control, 14 lighting zones around the edge cycle through 12 preset modes over a single USB cable, and stitched anti-fray edges survive the daily grind. A full rubber base keeps it planted through the most frantic rounds.",
      features: ["900 x 400 x 4 mm micro-woven cloth surface", "14 RGB zones with 12 preset lighting modes", "Stitched anti-fray edges with spill-resistant coating", "Full-coverage non-slip rubber base"],
      rating: 4.7,
      reviews: 350,
      stock: 40,
      badge: null
    },
    {
      id: 39,
      name: "Arcade Retro Mini Console",
      category: "Gaming",
      price: 79.0,
      oldPrice: null,
      image: "assets/images/products/arcade-retro-console.jpg",
      shortDescription: "Plug-and-play retro console with two wireless gamepads and 200 built-in classic titles.",
      description:
        "Arcade is a rainy Saturday in a box. Two included 2.4GHz wireless gamepads make couch co-op instant, 200 built-in retro titles load straight from the menu, and HDMI output upscales everything to clean 1080p with optional scanline filters. Save states mean you can finally finish the ones that beat you as a kid.",
      features: ["200 built-in retro titles across genres", "Two 2.4GHz wireless gamepads included", "1080p HDMI output with scanline filter", "Save states and one-button rewind"],
      rating: 4.2,
      reviews: 190,
      stock: 0,
      badge: null
    },
    {
      id: 40,
      name: "Glow Smart Bulb 4-Pack",
      category: "Smart Home",
      price: 49.99,
      oldPrice: null,
      image: "assets/images/products/glow-smart-bulbs.jpg",
      shortDescription: "Four WiFi colour bulbs with 16 million shades, schedules and voice assistant control.",
      description:
        "Glow makes lighting the easiest room upgrade in the house. Each 800-lumen bulb dials through 16 million colours and tunable whites from 2200K to 6500K, works over plain 2.4GHz WiFi with no hub, and follows schedules, scenes and sunrise routines from the app. Voice control through the major assistants is set up in minutes.",
      features: ["800 lumens with 16 million colours per bulb", "Tunable white from 2200K to 6500K", "2.4GHz WiFi with no hub required", "Schedules, scenes and voice assistant support"],
      rating: 4.6,
      reviews: 370,
      stock: 37,
      badge: null
    },
    {
      id: 41,
      name: "Haven Smart Speaker",
      category: "Smart Home",
      price: 89.0,
      oldPrice: 109.0,
      image: "assets/images/products/haven-smart-speaker.jpg",
      shortDescription: "Compact smart speaker with 360-degree sound, far-field mics and a physical mute switch.",
      description:
        "Haven fills the room without dominating the shelf. A 360-degree driver arrangement pushes clear sound to every corner, six far-field microphones catch requests over the music, and multi-room pairing links speakers across the house. A physical mic-off switch keeps quiet time genuinely quiet.",
      features: ["360-degree sound with dual passive radiators", "Six far-field microphones with echo cancellation", "Multi-room pairing and stereo linking", "Physical microphone-off switch"],
      rating: 4.4,
      reviews: 230,
      stock: 20,
      badge: "Sale"
    },
    {
      id: 42,
      name: "Sentry Security Camera",
      category: "Smart Home",
      price: 79.99,
      oldPrice: null,
      image: "assets/images/products/sentry-security-cam.jpg",
      shortDescription: "Indoor-outdoor 2K security camera with colour night vision and local microSD storage.",
      description:
        "Sentry watches so you can stop checking. The 2K sensor with colour night vision keeps detail after dark, on-device person and vehicle detection cuts the false alerts, and an IP65 shell handles rain, dust and freezing mornings. Clips save to a local microSD card, so there is no subscription between you and your own footage.",
      features: ["2K resolution with colour night vision", "On-device person and vehicle detection", "IP65 weatherproof for indoor or outdoor use", "Local microSD storage, no subscription required"],
      rating: 4.5,
      reviews: 280,
      stock: 24,
      badge: null
    },
    {
      id: 43,
      name: "Sweep Robot Vacuum",
      category: "Smart Home",
      price: 299.0,
      oldPrice: 379.0,
      image: "assets/images/products/sweep-robot-vacuum.jpg",
      shortDescription: "Laser-mapping robot vacuum with 4000Pa suction, mopping and a self-emptying dock.",
      description:
        "Sweep handles the floors so the weekend stays yours. Laser navigation maps every room for no-go zones and targeted cleans, 4000Pa suction lifts pet hair out of carpet, and the swappable mop plate takes care of hard floors on the same run. The self-emptying dock holds seven weeks of debris before it needs a thought.",
      features: ["Laser mapping with room-by-room scheduling", "4000Pa suction with automatic carpet boost", "Vacuums and mops in a single pass", "Self-emptying dock with 7-week capacity"],
      rating: 4.3,
      reviews: 160,
      stock: 10,
      badge: "Sale"
    },
    {
      id: 44,
      name: "Vista Smart Display 8",
      category: "Smart Home",
      price: 129.0,
      oldPrice: null,
      image: "assets/images/products/vista-smart-display.jpg",
      shortDescription: "8-inch smart display for video calls, recipes, camera feeds and whole-home control.",
      description:
        "Vista puts the whole house on one countertop screen. The 8-inch HD touchscreen handles video calls through a 5MP auto-framing camera, steps through recipes hands-free, and pulls up compatible doorbells and cameras on request. When idle it becomes a photo frame with a light sensor that matches the room.",
      features: ["8-inch HD touchscreen with adaptive brightness", "5MP camera with auto-framing and privacy shutter", "Controls compatible lights, cameras and thermostats", "Ambient photo-frame mode when idle"],
      rating: 4.4,
      reviews: 200,
      stock: 14,
      badge: "New"
    },
    {
      id: 45,
      name: "Guard Video Doorbell",
      category: "Smart Home",
      price: 149.0,
      oldPrice: null,
      image: "assets/images/products/guard-video-doorbell.jpg",
      shortDescription: "2K video doorbell with a head-to-toe view, two-way talk and package detection.",
      description:
        "Guard answers the door whether you are home or not. A 2K sensor with a head-to-toe vertical view shows visitors and parcels alike, two-way talk with preset quick replies handles couriers from anywhere, and package detection pings the moment a box lands. Wired or battery installation takes about fifteen minutes either way.",
      features: ["2K resolution with head-to-toe field of view", "Two-way talk with preset quick replies", "Person and package detection alerts", "Wired or battery install with encrypted local storage"],
      rating: 4.6,
      reviews: 175,
      stock: 18,
      badge: null
    },
    {
      id: 46,
      name: "Surge 20K Power Bank",
      category: "Power & Charging",
      price: 49.99,
      oldPrice: null,
      image: "assets/images/products/surge-power-bank.jpg",
      shortDescription: "20,000mAh power bank with 65W USB-C output that charges laptops and phones alike.",
      description:
        "Surge is the difference between an outlet hunt and a working flight. The 20,000mAh cell delivers 65W over USB-C, enough to fast-charge a laptop or take a phone to half in under 25 minutes, and three ports keep tablets and earbuds topped up at the same time. A digital display shows the exact percentage left, not a guess in four dots.",
      features: ["20,000mAh capacity, airline carry-on compliant", "65W USB-C Power Delivery output", "Three ports for simultaneous charging", "Digital percentage display with pass-through charging"],
      rating: 4.7,
      reviews: 360,
      stock: 41,
      badge: null
    },
    {
      id: 47,
      name: "Float Wireless Charging Pad",
      category: "Power & Charging",
      price: 29.99,
      oldPrice: 39.99,
      image: "assets/images/products/float-wireless-charger.jpg",
      shortDescription: "Slim 15W wireless charging pad that works through phone cases up to 5 mm thick.",
      description:
        "Float removes the last cable from the nightstand. It delivers up to 15W to compatible phones and 5W to earbuds, charges through cases up to 5 mm thick, and a soft-glow indicator dims at night instead of lighting the ceiling. Foreign-object detection and thermal control keep the overnight charge boring, exactly as it should be.",
      features: ["Up to 15W fast wireless charging", "Works through cases up to 5 mm thick", "Night-dimmed LED status indicator", "Foreign-object detection and thermal protection"],
      rating: 4.3,
      reviews: 330,
      stock: 45,
      badge: "Sale"
    },
    {
      id: 48,
      name: "Spark 65W GaN Charger",
      category: "Power & Charging",
      price: 44.99,
      oldPrice: null,
      image: "assets/images/products/spark-gan-charger.jpg",
      shortDescription: "Pocket-size 65W GaN wall charger with two USB-C ports, one USB-A and foldable prongs.",
      description:
        "Spark replaces the laptop brick and the drawer of cubes behind it. Gallium nitride internals push 65W through a charger half the size of a standard laptop adapter, two USB-C ports and a USB-A share the load intelligently, and foldable prongs keep it flat in a bag pocket. One charger covers the laptop, the phone and the earbuds.",
      features: ["65W output from a 40 percent smaller GaN design", "Two USB-C PD ports plus USB-A", "Smart power sharing across all three ports", "Foldable prongs in a travel-ready size"],
      rating: 4.8,
      reviews: 290,
      stock: 30,
      badge: "New"
    },
    {
      id: 49,
      name: "Tether Braided Cable 3-Pack",
      category: "Power & Charging",
      price: 24.99,
      oldPrice: null,
      image: "assets/images/products/tether-braided-cables.jpg",
      shortDescription: "Three braided USB-C cables in 1m, 2m and 3m lengths, all rated for 100W charging.",
      description:
        "Tether ends the daily hunt for the good cable. Each of the three lengths — 1m for the desk, 2m for the sofa, 3m for the awkward outlet — carries 100W charging and 480Mbps data through a double-braided nylon jacket. A 30,000-bend rating and reinforced strain relief mean the fray never starts.",
      features: ["1m, 2m and 3m lengths in one pack", "100W Power Delivery with 480Mbps data", "Double-braided nylon, 30,000-bend rated", "Reinforced strain relief at both ends"],
      rating: 4.6,
      reviews: 375,
      stock: 48,
      badge: null
    },
    {
      id: 50,
      name: "Vault 1TB External SSD",
      category: "Storage",
      price: 119.0,
      oldPrice: 149.0,
      image: "assets/images/products/vault-external-ssd.jpg",
      shortDescription: "Palm-size 1TB external SSD with 1,050MB/s reads and hardware AES-256 encryption.",
      description:
        "Vault moves a project library in the time coffee takes to brew. Reads up to 1,050MB/s and writes to 1,000MB/s over USB-C 3.2, hardware AES-256 encryption locks the drive itself rather than the software around it, and a rubberised shell shrugs off two-metre drops. Cables for USB-C and USB-A ship in the box, so it works everywhere already.",
      features: ["1TB capacity with up to 1,050MB/s reads", "Hardware AES-256 encryption", "Two-metre drop-rated rubberised shell", "USB-C and USB-A cables included"],
      rating: 4.7,
      reviews: 240,
      stock: 25,
      badge: "Sale"
    },
    {
      id: 51,
      name: "Swift 256GB microSD Card",
      category: "Storage",
      price: 32.0,
      oldPrice: null,
      image: "assets/images/products/swift-microsd.jpg",
      shortDescription: "256GB microSD with 160MB/s reads, A2 app rating and a full-size adapter included.",
      description:
        "Swift keeps cameras, drones and handhelds out of the storage-full warning. Reads up to 160MB/s and V30 sustained writes handle 4K recording without dropped frames, while the A2 rating keeps apps on handheld consoles feeling installed rather than streamed. It is waterproof, temperature-proof and X-ray-proof, with a full-size adapter in the box.",
      features: ["256GB capacity with up to 160MB/s reads", "V30 and U3 rated for sustained 4K recording", "A2 app performance class", "Waterproof, temperature-proof and X-ray-proof"],
      rating: 4.5,
      reviews: 355,
      stock: 46,
      badge: null
    },
    {
      id: 52,
      name: "Keychain 128GB Flash Drive",
      category: "Storage",
      price: 19.99,
      oldPrice: null,
      image: "assets/images/products/keychain-flash-drive.jpg",
      shortDescription: "128GB USB 3.2 flash drive in a capless zinc-alloy shell that clips onto your keys.",
      description:
        "Keychain is the backup that is always in your pocket. The 128GB drive reads at 150MB/s over USB 3.2, the one-piece zinc-alloy body has no cap to lose, and the loop clips straight onto a keyring or lanyard. Plug it in anywhere and it simply mounts — no software, no fuss.",
      features: ["128GB capacity with 150MB/s reads", "Capless one-piece zinc-alloy body", "Integrated keyring loop", "USB 3.2, backwards compatible with USB 2.0"],
      rating: 4.4,
      reviews: 320,
      stock: 0,
      badge: null
    },
    {
      id: 53,
      name: "Lattice WiFi 6 Router",
      category: "Networking",
      price: 159.0,
      oldPrice: null,
      image: "assets/images/products/lattice-router.jpg",
      shortDescription: "Dual-band WiFi 6 router with 3,000Mbps throughput and coverage for 2,500 sq ft.",
      description:
        "Lattice is the upgrade the whole household notices at once. WiFi 6 pushes a combined 3,000Mbps across both bands, OFDMA and MU-MIMO keep 60-plus devices from stepping on each other, and four gigabit LAN ports handle the wired essentials. Built-in parental controls and a guest network run from a two-minute app setup.",
      features: ["WiFi 6 with 3,000Mbps combined throughput", "Handles 60-plus devices with OFDMA and MU-MIMO", "Four gigabit LAN ports plus gigabit WAN", "App setup with parental controls and guest network"],
      rating: 4.5,
      reviews: 185,
      stock: 16,
      badge: null
    },
    {
      id: 54,
      name: "Weave Mesh WiFi Kit (3-Pack)",
      category: "Networking",
      price: 279.0,
      oldPrice: 329.0,
      image: "assets/images/products/weave-mesh-kit.jpg",
      shortDescription: "Three-node WiFi 6 mesh system covering 6,000 sq ft with one seamless network.",
      description:
        "Weave replaces dead zones with one name and one password everywhere. Three WiFi 6 nodes blanket up to 6,000 square feet, a dedicated backhaul band keeps speeds honest at the far end of the house, and roaming hand-off is fast enough that video calls never notice the switch. Each node adds two gigabit Ethernet ports wherever you place it.",
      features: ["Covers up to 6,000 sq ft with three nodes", "Dedicated wireless backhaul band", "Seamless roaming under one network name", "Two gigabit Ethernet ports on every node"],
      rating: 4.6,
      reviews: 140,
      stock: 12,
      badge: "Sale"
    },
    {
      id: 55,
      name: "Page E-Reader",
      category: "Accessories",
      price: 139.0,
      oldPrice: null,
      image: "assets/images/products/page-e-reader.jpg",
      shortDescription: "6.8-inch glare-free e-reader with warm adjustable light and weeks of battery life.",
      description:
        "Page reads like paper and packs like a paperback. The 6.8-inch 300ppi e-ink display stays readable in direct sun, the front light shifts from cool white to warm amber for night chapters, and 16GB holds thousands of titles. With an IPX8 waterproof rating and up to six weeks per charge, the bath, the beach and the long trip are all fair territory.",
      features: ["6.8-inch 300ppi glare-free e-ink display", "Adjustable warm front light", "16GB storage for thousands of titles", "IPX8 waterproof, up to six weeks per charge"],
      rating: 4.8,
      reviews: 260,
      stock: 21,
      badge: null
    },
    {
      id: 56,
      name: "Terrain Desk Mat XL",
      category: "Accessories",
      price: 24.0,
      oldPrice: null,
      image: "assets/images/products/terrain-desk-mat.jpg",
      shortDescription: "900 x 400 mm vegan-leather desk mat that protects the desk and quiets the keyboard.",
      description:
        "Terrain gives the desk a finished look in ten seconds flat. The 900 x 400 mm vegan-leather surface tracks a mouse cleanly, softens keyboard sound and wipes clean with a damp cloth, while the non-slip suede base keeps it exactly where you put it. Double-stitched edges keep it flat and tidy for years, not months.",
      features: ["900 x 400 mm covers keyboard and mouse", "Vegan-leather top wipes clean in seconds", "Non-slip suede backing", "Double-stitched edges resist curling"],
      rating: 4.4,
      reviews: 300,
      stock: 39,
      badge: null
    }
  ];

  /**
   * Returns the product catalog.
   * Async on purpose — swapping in a real API call later is a one-line change.
   * @returns {Promise<Array>}
   */
  App.getProducts = function () {
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve(PRODUCTS.slice());
      }, 180); // small delay so the loading state is real, not decorative
    });
  };

  /**
   * Look up a single product by id.
   * @param {number|string} id
   * @returns {Promise<Object|null>}
   */
  App.getProductById = function (id) {
    var wanted = Number(id);
    return App.getProducts().then(function (list) {
      return list.filter(function (p) { return p.id === wanted; })[0] || null;
    });
  };

})(window.NovaCart);
