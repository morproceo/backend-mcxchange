import bcrypt from 'bcryptjs';
import sequelize from '../config/database';
import {
  User,
  UserRole,
  UserStatus,
  Listing,
  ListingStatus,
  ListingVisibility,
  SafetyRating,
  AmazonRelayStatus,
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
} from '../models';
import { addMonths } from 'date-fns';

async function seedAll() {
  try {
    await sequelize.authenticate();
    console.log('Database connected');
    await sequelize.sync({ force: false });

    const hashedPassword = await bcrypt.hash('password123', 12);

    // ============================================================
    // 1. ADMIN
    // ============================================================
    const adminEmail = 'admin@admin.com';
    let admin = await User.findOne({ where: { email: adminEmail } });
    if (!admin) {
      admin = await User.create({
        email: adminEmail,
        password: hashedPassword,
        name: 'Admin User',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        verified: true,
        emailVerified: true,
        totalCredits: 50,
        usedCredits: 0,
        companyName: 'Domilea Platform',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        phone: '555-000-0000',
      });
      console.log(`Created admin: ${adminEmail}`);
    } else {
      console.log(`Admin already exists: ${adminEmail}`);
    }

    // ============================================================
    // 2. SELLERS (5 sellers)
    // ============================================================
    const sellersData = [
      { email: 'seller@test.com', name: 'Mike Johnson', company: 'Johnson Freight LLC', city: 'Dallas', state: 'TX', zip: '75201', phone: '555-100-0001' },
      { email: 'seller2@test.com', name: 'Sarah Martinez', company: 'Martinez Transport Inc', city: 'Houston', state: 'TX', zip: '77001', phone: '555-100-0002' },
      { email: 'seller3@test.com', name: 'James Wilson', company: 'Wilson Carriers Corp', city: 'Atlanta', state: 'GA', zip: '30301', phone: '555-100-0003' },
      { email: 'seller4@test.com', name: 'Linda Chen', company: 'Pacific Haulers LLC', city: 'Los Angeles', state: 'CA', zip: '90001', phone: '555-100-0004' },
      { email: 'seller5@test.com', name: 'Robert Davis', company: 'Midwest Express Transport', city: 'Chicago', state: 'IL', zip: '60601', phone: '555-100-0005' },
    ];

    const sellers: User[] = [];
    for (const s of sellersData) {
      let seller = await User.findOne({ where: { email: s.email } });
      if (!seller) {
        seller = await User.create({
          email: s.email,
          password: hashedPassword,
          name: s.name,
          role: UserRole.SELLER,
          status: UserStatus.ACTIVE,
          verified: true,
          emailVerified: true,
          sellerVerified: true,
          totalCredits: 0,
          usedCredits: 0,
          companyName: s.company,
          city: s.city,
          state: s.state,
          zipCode: s.zip,
          phone: s.phone,
          trustScore: Math.floor(Math.random() * 30) + 70,
        });
        console.log(`Created seller: ${s.email}`);
      } else {
        console.log(`Seller already exists: ${s.email}`);
      }
      sellers.push(seller);
    }

    // ============================================================
    // 3. BUYERS (2 buyers - one VIP)
    // ============================================================
    const buyerEmail = 'buyer@test.com';
    let buyer = await User.findOne({ where: { email: buyerEmail } });
    if (!buyer) {
      buyer = await User.create({
        email: buyerEmail,
        password: hashedPassword,
        name: 'VIP Buyer',
        role: UserRole.BUYER,
        status: UserStatus.ACTIVE,
        verified: true,
        emailVerified: true,
        totalCredits: 50,
        usedCredits: 0,
        companyName: 'Elite Transport Holdings',
        city: 'Miami',
        state: 'FL',
        zipCode: '33101',
        phone: '555-200-0001',
        trustScore: 95,
      });
      console.log(`Created VIP buyer: ${buyerEmail}`);
    } else {
      console.log(`Buyer already exists: ${buyerEmail}`);
    }

    // Give VIP buyer an Enterprise subscription
    const existingSub = await Subscription.findOne({ where: { userId: buyer.id } });
    if (!existingSub) {
      await Subscription.create({
        userId: buyer.id,
        plan: SubscriptionPlan.ENTERPRISE,
        status: SubscriptionStatus.ACTIVE,
        priceMonthly: 39.99,
        priceYearly: 383.99,
        isYearly: false,
        creditsPerMonth: 25,
        creditsRemaining: 25,
        startDate: new Date(),
        renewalDate: addMonths(new Date(), 1),
      });
      console.log(`Created ENTERPRISE subscription for VIP buyer`);
    } else {
      console.log(`Subscription already exists for VIP buyer`);
    }

    const buyer2Email = 'buyer2@test.com';
    let buyer2 = await User.findOne({ where: { email: buyer2Email } });
    if (!buyer2) {
      buyer2 = await User.create({
        email: buyer2Email,
        password: hashedPassword,
        name: 'Regular Buyer',
        role: UserRole.BUYER,
        status: UserStatus.ACTIVE,
        verified: true,
        emailVerified: true,
        totalCredits: 5,
        usedCredits: 0,
        companyName: 'Quick Freight Inc',
        city: 'Denver',
        state: 'CO',
        zipCode: '80201',
        phone: '555-200-0002',
      });
      console.log(`Created regular buyer: ${buyer2Email}`);
    }

    // ============================================================
    // 4. LISTINGS - Regular, Premium, and VIP
    // ============================================================
    const allListings = [
      // ---- VIP Listings (seller 0 - Mike Johnson) ----
      {
        mcNumber: 'MC-800100',
        dotNumber: 'DOT-3200100',
        legalName: 'Apex Freight Solutions Inc',
        title: 'VIP - Amazon Relay Active, 8 Years Clean, 12 Truck Fleet',
        description: 'Established MC authority with pristine safety record. Active Amazon Relay account with excellent performance scores. Full fleet of 12 trucks, 15 drivers. BIPD and cargo insurance current. Turn-key operation ready for immediate takeover.',
        askingPrice: 185000,
        listingPrice: 179000,
        city: 'Houston',
        state: 'TX',
        yearsActive: 8,
        fleetSize: 12,
        totalDrivers: 15,
        safetyRating: SafetyRating.SATISFACTORY,
        amazonStatus: AmazonRelayStatus.ACTIVE,
        highwaySetup: true,
        bipdCoverage: 1000000,
        cargoCoverage: 100000,
        isPremium: true,
        isVip: true,
        sellerId: sellers[0].id,
      },
      {
        mcNumber: 'MC-800101',
        dotNumber: 'DOT-3200101',
        legalName: 'National Haulers Group Inc',
        title: 'VIP Exclusive - 10 Year Authority, 30 Truck Fleet, Top Tier',
        description: 'One of the most established authorities available. 10 years of clean operation with a large 30-truck fleet. Full driver roster, all insurance maximums met. Amazon Relay active with top performance tier. Rare, premium acquisition opportunity.',
        askingPrice: 375000,
        listingPrice: 359000,
        city: 'Chicago',
        state: 'IL',
        yearsActive: 10,
        fleetSize: 30,
        totalDrivers: 35,
        safetyRating: SafetyRating.SATISFACTORY,
        amazonStatus: AmazonRelayStatus.ACTIVE,
        highwaySetup: true,
        bipdCoverage: 2000000,
        cargoCoverage: 200000,
        isPremium: true,
        isVip: true,
        sellerId: sellers[0].id,
      },
      {
        mcNumber: 'MC-800102',
        dotNumber: 'DOT-3200102',
        legalName: 'Diamond Route Carriers LLC',
        title: 'VIP - West Coast Authority, 6 Years, Satisfactory Safety',
        description: 'West coast focused carrier with strong regional presence. 6 years of operation with satisfactory safety rating. 15 trucks currently active. Excellent relationships with brokers and shippers.',
        askingPrice: 165000,
        listingPrice: 155000,
        city: 'Los Angeles',
        state: 'CA',
        yearsActive: 6,
        fleetSize: 15,
        totalDrivers: 18,
        safetyRating: SafetyRating.SATISFACTORY,
        amazonStatus: AmazonRelayStatus.NONE,
        highwaySetup: true,
        bipdCoverage: 1000000,
        cargoCoverage: 100000,
        isPremium: true,
        isVip: true,
        sellerId: sellers[0].id,
      },

      // ---- Premium Listings (seller 1 - Sarah Martinez) ----
      {
        mcNumber: 'MC-800200',
        dotNumber: 'DOT-3200200',
        legalName: 'CrossCountry Logistics LLC',
        title: 'Premium - 5 Year Authority, Satisfactory Safety, 20 Trucks',
        description: 'Well-established cross-country logistics operation. Large fleet with experienced drivers. Excellent safety rating with no violations in the past 3 years. Insurance fully up to date.',
        askingPrice: 250000,
        listingPrice: 239000,
        city: 'Atlanta',
        state: 'GA',
        yearsActive: 5,
        fleetSize: 20,
        totalDrivers: 25,
        safetyRating: SafetyRating.SATISFACTORY,
        amazonStatus: AmazonRelayStatus.NONE,
        highwaySetup: true,
        bipdCoverage: 1500000,
        cargoCoverage: 150000,
        isPremium: true,
        isVip: false,
        sellerId: sellers[1].id,
      },
      {
        mcNumber: 'MC-800201',
        dotNumber: 'DOT-3200201',
        legalName: 'Swift Star Transport Corp',
        title: 'Premium - Amazon Relay + Highway Setup, 3 Year Authority',
        description: 'Growing carrier with Amazon Relay active and highway setup. Clean safety record with satisfactory rating. Currently running 8 trucks with room to scale. All insurance and bonds current.',
        askingPrice: 125000,
        listingPrice: 119000,
        city: 'Phoenix',
        state: 'AZ',
        yearsActive: 3,
        fleetSize: 8,
        totalDrivers: 10,
        safetyRating: SafetyRating.SATISFACTORY,
        amazonStatus: AmazonRelayStatus.ACTIVE,
        highwaySetup: true,
        bipdCoverage: 750000,
        cargoCoverage: 100000,
        isPremium: true,
        isVip: false,
        sellerId: sellers[1].id,
      },
      {
        mcNumber: 'MC-800202',
        dotNumber: 'DOT-3200202',
        legalName: 'Golden Eagle Freight Inc',
        title: 'Premium - Southeast Authority, 4 Years, 10 Trucks',
        description: 'Southeast-focused carrier with 4 years of clean operation. Fleet of 10 trucks running regional routes. Strong broker relationships and repeat customers. Highway setup complete.',
        askingPrice: 145000,
        listingPrice: 139000,
        city: 'Nashville',
        state: 'TN',
        yearsActive: 4,
        fleetSize: 10,
        totalDrivers: 12,
        safetyRating: SafetyRating.SATISFACTORY,
        amazonStatus: AmazonRelayStatus.PENDING,
        highwaySetup: true,
        bipdCoverage: 1000000,
        cargoCoverage: 100000,
        isPremium: true,
        isVip: false,
        sellerId: sellers[1].id,
      },

      // ---- Regular Listings (sellers 2, 3, 4) ----
      {
        mcNumber: 'MC-800300',
        dotNumber: 'DOT-3200300',
        legalName: 'Reliable Routes LLC',
        title: 'Clean 2 Year MC Authority - Ready to Scale',
        description: 'Newer MC authority with clean record. Currently running 3 trucks. Satisfactory safety rating, insurance current. Great starter authority for someone looking to build.',
        askingPrice: 65000,
        listingPrice: 59000,
        city: 'Charlotte',
        state: 'NC',
        yearsActive: 2,
        fleetSize: 3,
        totalDrivers: 4,
        safetyRating: SafetyRating.SATISFACTORY,
        amazonStatus: AmazonRelayStatus.NONE,
        highwaySetup: false,
        bipdCoverage: 750000,
        cargoCoverage: 50000,
        isPremium: false,
        isVip: false,
        sellerId: sellers[2].id,
      },
      {
        mcNumber: 'MC-800301',
        dotNumber: 'DOT-3200301',
        legalName: 'Heartland Trucking Co',
        title: '3 Year Authority - Midwest Region, 5 Trucks',
        description: 'Midwest-based carrier with 3 years of operation. Running 5 trucks on regional routes. Insurance and bonds current. Good opportunity for regional expansion.',
        askingPrice: 85000,
        listingPrice: 79000,
        city: 'Kansas City',
        state: 'MO',
        yearsActive: 3,
        fleetSize: 5,
        totalDrivers: 6,
        safetyRating: SafetyRating.SATISFACTORY,
        amazonStatus: AmazonRelayStatus.NONE,
        highwaySetup: true,
        bipdCoverage: 750000,
        cargoCoverage: 75000,
        isPremium: false,
        isVip: false,
        sellerId: sellers[2].id,
      },
      {
        mcNumber: 'MC-800302',
        dotNumber: 'DOT-3200302',
        legalName: 'SunCoast Carriers Inc',
        title: '1 Year Clean Authority - Florida Based',
        description: 'New authority with clean record. Based in Florida, running 2 trucks. Great entry point into the market at an affordable price. All documentation current.',
        askingPrice: 45000,
        listingPrice: 42000,
        city: 'Tampa',
        state: 'FL',
        yearsActive: 1,
        fleetSize: 2,
        totalDrivers: 2,
        safetyRating: SafetyRating.NONE,
        amazonStatus: AmazonRelayStatus.NONE,
        highwaySetup: false,
        bipdCoverage: 500000,
        cargoCoverage: 50000,
        isPremium: false,
        isVip: false,
        sellerId: sellers[3].id,
      },
      {
        mcNumber: 'MC-800303',
        dotNumber: 'DOT-3200303',
        legalName: 'Mountain Pass Freight LLC',
        title: '4 Year Authority - Rocky Mountain Region, 7 Trucks',
        description: 'Rocky Mountain region carrier with 4 years of experience. Running 7 trucks specializing in mountain routes. Strong safety record. Insurance fully current.',
        askingPrice: 110000,
        listingPrice: 105000,
        city: 'Denver',
        state: 'CO',
        yearsActive: 4,
        fleetSize: 7,
        totalDrivers: 8,
        safetyRating: SafetyRating.SATISFACTORY,
        amazonStatus: AmazonRelayStatus.NONE,
        highwaySetup: true,
        bipdCoverage: 1000000,
        cargoCoverage: 100000,
        isPremium: false,
        isVip: false,
        sellerId: sellers[3].id,
      },
      {
        mcNumber: 'MC-800304',
        dotNumber: 'DOT-3200304',
        legalName: 'Great Lakes Transport Corp',
        title: '6 Year Authority - Great Lakes Region, Amazon Pending',
        description: 'Great Lakes carrier with 6 years clean operation. 12 trucks, Amazon Relay application pending. Excellent safety record and broker relationships. Highway fully set up.',
        askingPrice: 155000,
        listingPrice: 148000,
        city: 'Detroit',
        state: 'MI',
        yearsActive: 6,
        fleetSize: 12,
        totalDrivers: 14,
        safetyRating: SafetyRating.SATISFACTORY,
        amazonStatus: AmazonRelayStatus.PENDING,
        highwaySetup: true,
        bipdCoverage: 1000000,
        cargoCoverage: 100000,
        isPremium: false,
        isVip: false,
        sellerId: sellers[4].id,
      },
      {
        mcNumber: 'MC-800305',
        dotNumber: 'DOT-3200305',
        legalName: 'Prairie Wind Logistics Inc',
        title: '2 Year Authority - Plains Region, 4 Trucks',
        description: 'Plains region carrier, 2 years operating. Running 4 trucks on mid-range routes. Clean record with all insurance current. Affordable entry into freight hauling.',
        askingPrice: 55000,
        listingPrice: 49000,
        city: 'Omaha',
        state: 'NE',
        yearsActive: 2,
        fleetSize: 4,
        totalDrivers: 5,
        safetyRating: SafetyRating.NONE,
        amazonStatus: AmazonRelayStatus.NONE,
        highwaySetup: false,
        bipdCoverage: 500000,
        cargoCoverage: 50000,
        isPremium: false,
        isVip: false,
        sellerId: sellers[4].id,
      },
      {
        mcNumber: 'MC-800306',
        dotNumber: 'DOT-3200306',
        legalName: 'Lone Star Express LLC',
        title: '5 Year Texas Authority - Amazon Active, 9 Trucks',
        description: 'Texas-based carrier with 5 years of operation. Amazon Relay active with strong scores. 9 trucks running OTR and regional. Satisfactory safety rating.',
        askingPrice: 140000,
        listingPrice: 135000,
        city: 'San Antonio',
        state: 'TX',
        yearsActive: 5,
        fleetSize: 9,
        totalDrivers: 11,
        safetyRating: SafetyRating.SATISFACTORY,
        amazonStatus: AmazonRelayStatus.ACTIVE,
        highwaySetup: true,
        bipdCoverage: 1000000,
        cargoCoverage: 100000,
        isPremium: false,
        isVip: false,
        sellerId: sellers[4].id,
      },
    ];

    let createdCount = 0;
    for (const data of allListings) {
      const existing = await Listing.findOne({ where: { mcNumber: data.mcNumber } });
      if (existing) {
        console.log(`Listing already exists: ${data.mcNumber}`);
        continue;
      }

      await Listing.create({
        ...data,
        status: ListingStatus.ACTIVE,
        visibility: ListingVisibility.PUBLIC,
        insuranceOnFile: true,
        sellingWithEmail: true,
        sellingWithPhone: false,
        contactEmail: sellersData.find((_, i) => sellers[i]?.id === data.sellerId)?.email || 'seller@test.com',
        listingFeePaid: true,
        views: Math.floor(Math.random() * 300) + 20,
        saves: Math.floor(Math.random() * 40) + 2,
        publishedAt: new Date(),
      } as any);
      createdCount++;
      console.log(`Created listing: ${data.title}`);
    }

    // ============================================================
    // SUMMARY
    // ============================================================
    console.log('\n========================================');
    console.log('  SEED COMPLETE!');
    console.log('========================================');
    console.log('');
    console.log('  ACCOUNTS (all passwords: password123)');
    console.log('  ─────────────────────────────────────');
    console.log(`  Admin:  ${adminEmail}`);
    console.log(`  Seller: seller@test.com`);
    console.log(`  Buyer:  buyer@test.com  (VIP - Enterprise subscription)`);
    console.log('');
    console.log('  OTHER ACCOUNTS');
    console.log('  ─────────────────────────────────────');
    console.log('  seller2@test.com - seller5@test.com');
    console.log('  buyer2@test.com (regular buyer)');
    console.log('');
    console.log(`  LISTINGS: ${createdCount} created`);
    console.log('    3 VIP listings');
    console.log('    3 Premium listings');
    console.log('    8 Regular listings');
    console.log('========================================\n');

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
}

seedAll();
