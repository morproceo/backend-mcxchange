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

async function seedVip() {
  try {
    await sequelize.authenticate();
    console.log('Database connected');

    await sequelize.sync({ force: false });

    const hashedPassword = await bcrypt.hash('password123', 12);

    // ==================== 1. Create or find VIP Buyer ====================
    const buyerEmail = 'vipbuyer@test.com';
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
        totalCredits: 25,
        usedCredits: 0,
        companyName: 'Elite Transport Holdings',
        city: 'Miami',
        state: 'FL',
        zipCode: '33101',
      });
      console.log(`Created VIP buyer: ${buyerEmail}`);
    } else {
      console.log(`VIP buyer already exists: ${buyerEmail}`);
    }

    // ==================== 2. Give buyer Enterprise subscription ====================
    const existingSub = await Subscription.findOne({ where: { userId: buyer.id } });

    if (existingSub) {
      await existingSub.update({
        plan: SubscriptionPlan.ENTERPRISE,
        status: SubscriptionStatus.ACTIVE,
        priceMonthly: 39.99,
        priceYearly: 383.99,
        isYearly: false,
        creditsPerMonth: 25,
        creditsRemaining: 25,
        startDate: new Date(),
        renewalDate: addMonths(new Date(), 1),
        cancelledAt: null,
      });
      console.log(`Updated subscription to ENTERPRISE for ${buyerEmail}`);
    } else {
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
      console.log(`Created ENTERPRISE subscription for ${buyerEmail}`);
    }

    // ==================== 3. Create or find a Seller ====================
    const sellerEmail = 'vipseller@test.com';
    let seller = await User.findOne({ where: { email: sellerEmail } });

    if (!seller) {
      seller = await User.create({
        email: sellerEmail,
        password: hashedPassword,
        name: 'VIP Seller',
        role: UserRole.SELLER,
        status: UserStatus.ACTIVE,
        verified: true,
        emailVerified: true,
        sellerVerified: true,
        totalCredits: 0,
        usedCredits: 0,
        companyName: 'Premium Carriers LLC',
        city: 'Dallas',
        state: 'TX',
        zipCode: '75201',
      });
      console.log(`Created VIP seller: ${sellerEmail}`);
    } else {
      console.log(`VIP seller already exists: ${sellerEmail}`);
    }

    // ==================== 4. Create VIP Listings ====================
    const vipListings = [
      {
        mcNumber: 'MC-1001001',
        dotNumber: 'DOT-2001001',
        legalName: 'Apex Freight Solutions Inc',
        title: 'Premium MC Authority - Amazon Relay Active, 8 Years Clean',
        description: 'Established MC authority with pristine safety record. Active Amazon Relay account with excellent performance scores. Full fleet of 12 trucks, 15 drivers. BIPD and cargo insurance current. This is a turn-key operation ready for immediate takeover.',
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
      },
      {
        mcNumber: 'MC-1001002',
        dotNumber: 'DOT-2001002',
        legalName: 'CrossCountry Logistics LLC',
        title: 'VIP - 5 Year Authority, Satisfactory Safety, 20 Trucks',
        description: 'Well-established cross-country logistics operation. Large fleet with experienced drivers. Excellent safety rating with no violations in the past 3 years. Insurance fully up to date. Highway setup complete with all major load boards.',
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
      },
      {
        mcNumber: 'MC-1001003',
        dotNumber: 'DOT-2001003',
        legalName: 'Swift Star Transport Corp',
        title: 'Exclusive - Amazon Relay + Highway Setup, 3 Year Authority',
        description: 'Growing carrier with Amazon Relay active and highway setup. Clean safety record with satisfactory rating. Currently running 8 trucks with room to scale. All insurance and bonds current. Great opportunity for expansion-minded buyers.',
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
      },
      {
        mcNumber: 'MC-1001004',
        dotNumber: 'DOT-2001004',
        legalName: 'National Haulers Group Inc',
        title: 'VIP Exclusive - 10 Year Authority, 30 Truck Fleet',
        description: 'One of the most established authorities on the platform. 10 years of clean operation with a large 30-truck fleet. Full driver roster, all insurance maximums met. Amazon Relay active with top performance tier. This is a rare, premium acquisition opportunity.',
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
      },
      {
        mcNumber: 'MC-1001005',
        dotNumber: 'DOT-2001005',
        legalName: 'Pacific Route Carriers LLC',
        title: 'VIP - West Coast Authority, 6 Years, Clean Record',
        description: 'West coast focused carrier with strong regional presence. 6 years of operation with satisfactory safety rating. 15 trucks currently active. Excellent relationships with brokers and shippers. Highway and load board accounts fully set up.',
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
      },
    ];

    let createdCount = 0;
    for (const data of vipListings) {
      const existing = await Listing.findOne({ where: { mcNumber: data.mcNumber } });
      if (existing) {
        // Update to be VIP and active if it exists
        await existing.update({ isVip: true, isPremium: true, status: ListingStatus.ACTIVE });
        console.log(`Updated existing listing ${data.mcNumber} to VIP`);
      } else {
        await Listing.create({
          ...data,
          sellerId: seller.id,
          isPremium: true,
          isVip: true,
          status: ListingStatus.ACTIVE,
          visibility: ListingVisibility.PUBLIC,
          insuranceOnFile: true,
          sellingWithEmail: true,
          sellingWithPhone: false,
          contactEmail: sellerEmail,
          listingFeePaid: true,
          views: Math.floor(Math.random() * 200) + 50,
          saves: Math.floor(Math.random() * 30) + 5,
        } as any);
        createdCount++;
        console.log(`Created VIP listing: ${data.title}`);
      }
    }

    console.log('\n========================================');
    console.log('VIP Seed Complete!');
    console.log('========================================');
    console.log(`Buyer:  ${buyerEmail} / password123 (ENTERPRISE subscription)`);
    console.log(`Seller: ${sellerEmail} / password123`);
    console.log(`VIP Listings created: ${createdCount}`);
    console.log('========================================\n');

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
}

seedVip();
