export const defaultCategories = [
    { id: "tea", name: "Chai Specialties", sortOrder: 1, active: true },
    { id: "cold-coffee", name: "Cold Coffee & Shakes", sortOrder: 2, active: true },
    { id: "pizza", name: "Artisanal Pizzas", sortOrder: 3, active: true },
    { id: "burger", name: "Gourmet Burgers", sortOrder: 4, active: true },
    { id: "maggi-pasta", name: "Maggi & Pasta", sortOrder: 5, active: true },
    { id: "fries-snacks", name: "Fries & Snacks", sortOrder: 6, active: true },
    { id: "mocktails", name: "Refreshing Mocktails", sortOrder: 7, active: true },
    { id: "combos", name: "Special Combos", sortOrder: 8, active: true }
];

export const defaultProducts = [
    // Tea
    {
        id: "t1",
        categoryId: "tea",
        name: "Adrak Elaichi Chai",
        description: "Freshly brewed milk tea infused with crushed ginger and green cardamom.",
        price: 30,
        image: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
        isAvailable: true,
        isPopular: true
    },
    {
        id: "t2",
        categoryId: "tea",
        name: "Masala Shotts Chai",
        description: "Our signature strong tea brewed with a secret blend of ground spices.",
        price: 35,
        image: "https://images.unsplash.com/photo-1563886424715-a5b149b10996?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
        isAvailable: true,
        isPopular: true
    },
    {
        id: "t3",
        categoryId: "tea",
        name: "Kesari Kullhad Chai",
        description: "Traditional tea flavored with real saffron strands, served in an earthen clay pot.",
        price: 50,
        image: "https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
        isAvailable: true,
        isPopular: false
    },

    // Cold Coffee
    {
        id: "cc1",
        categoryId: "cold-coffee",
        name: "Classic Frappe",
        description: "Smooth double-shot espresso blended with chilled milk and vanilla ice cream.",
        price: 90,
        image: "https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
        isAvailable: true,
        isPopular: true
    },
    {
        id: "cc2",
        categoryId: "cold-coffee",
        name: "Hazelnut Cold Coffee",
        description: "Rich cold coffee with a premium toasted hazelnut syrup twist.",
        price: 110,
        image: "https://images.unsplash.com/photo-1541658016709-82535e94bc69?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
        isAvailable: true,
        isPopular: false
    },
    {
        id: "cc3",
        categoryId: "cold-coffee",
        name: "Brownie Blast Shake",
        description: "Thick chocolate milkshake blended with chunks of homemade walnut brownie.",
        price: 130,
        image: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
        isAvailable: true,
        isPopular: true
    },

    // Pizza
    {
        id: "p1",
        categoryId: "pizza",
        name: "Double Cheese Margherita",
        description: "Classic pizza topped with premium mozzarella cheese and fresh basil leaves.",
        price: 160,
        image: "https://images.unsplash.com/photo-1604382355076-af4b0eb60143?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
        isAvailable: true,
        isPopular: false
    },
    {
        id: "p2",
        categoryId: "pizza",
        name: "Chai Shotts Special Pizza",
        description: "Topped with paneer tikka, capsicum, onions, sweetcorn, olives and spicy green chutney drizzle.",
        price: 210,
        image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
        isAvailable: true,
        isPopular: true
    },

    // Burgers
    {
        id: "b1",
        categoryId: "burger",
        name: "Crispy Aloo Tikki Burger",
        description: "Spicy potato patty loaded with crisp lettuce, onion slices and secret burger sauce.",
        price: 60,
        image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
        isAvailable: true,
        isPopular: false
    },
    {
        id: "b2",
        categoryId: "burger",
        name: "Cheesy Paneer Lava Burger",
        description: "Gourmet paneer patty filled with melting cheese core, topped with dynamic chipotle mayo.",
        price: 110,
        image: "https://images.unsplash.com/photo-1525059696034-4967a8e1dca2?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
        isAvailable: true,
        isPopular: true
    },

    // Maggi & Pasta
    {
        id: "mp1",
        categoryId: "maggi-pasta",
        name: "Cheese Masala Maggi",
        description: "Maggi noodles tossed with vegetables, loaded with extra cheese and authentic spices.",
        price: 70,
        image: "https://images.unsplash.com/photo-1612927601601-6638404737ce?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
        isAvailable: true,
        isPopular: true
    },
    {
        id: "mp2",
        categoryId: "maggi-pasta",
        name: "Creamy White Sauce Pasta",
        description: "Penne pasta prepared in a rich, buttery alfredo cream sauce with bell peppers.",
        price: 140,
        image: "https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
        isAvailable: true,
        isPopular: false
    },

    // Fries & Snacks
    {
        id: "fs1",
        categoryId: "fries-snacks",
        name: "Peri Peri Fries",
        description: "Golden crispy french fries tossed in spicy peri peri seasoning.",
        price: 80,
        image: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
        isAvailable: true,
        isPopular: true
    },
    {
        id: "fs2",
        categoryId: "fries-snacks",
        name: "Cheese Garlic Bread",
        description: "Four slices of toasted baguette topped with butter, fresh garlic, mozzarella, and herbs.",
        price: 110,
        image: "https://images.unsplash.com/photo-1573145959956-e9fae6b884b6?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
        isAvailable: true,
        isPopular: false
    },

    // Mocktails
    {
        id: "m1",
        categoryId: "mocktails",
        name: "Classic Mint Mojito",
        description: "Refreshing cooler with fresh mint leaves, lemon chunks, sugar syrup, and soda.",
        price: 80,
        image: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
        isAvailable: true,
        isPopular: false
    },
    {
        id: "m2",
        categoryId: "mocktails",
        name: "Blue Lagoon",
        description: "Curacao syrup mixed with lemonade, sprite, and served with crushed ice.",
        price: 90,
        image: "https://images.unsplash.com/photo-1536935338788-846bb9981813?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
        isAvailable: true,
        isPopular: true
    },

    // Combos
    {
        id: "c1",
        categoryId: "combos",
        name: "Chai & Maggi Combo",
        description: "Two Adrak Elaichi Chais + One Cheese Masala Maggi.",
        price: 110,
        image: "https://images.unsplash.com/photo-1608039755401-742074f0548d?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
        isAvailable: true,
        isPopular: true
    },
    {
        id: "c2",
        categoryId: "combos",
        name: "Couple Pizza Combo",
        description: "One Chai Shotts Special Pizza + One Classic Frappe + One Mint Mojito.",
        price: 340,
        image: "https://images.unsplash.com/photo-1590947132387-155cc02f3212?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
        isAvailable: true,
        isPopular: true
    }
];
