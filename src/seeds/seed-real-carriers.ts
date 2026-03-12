import sequelize from '../config/database';
import { Listing, ListingStatus, ListingVisibility, SafetyRating, AmazonRelayStatus, User } from '../models';

async function seedRealCarriers() {
  try {
    await sequelize.authenticate();
    console.log('Database connected');
    await sequelize.sync({ force: false });

    // Find a seller to attach listings to
    const seller = await User.findOne({ where: { role: 'seller' } });
    if (!seller) {
      console.error('No seller found! Run npm run db:seed first.');
      process.exit(1);
    }

    const realListings = [
      {
        mcNumber: 'MC-1089431',
        dotNumber: '3310825',
        legalName: 'JABI TRUCKING INC',
        title: '37-Unit Fleet — Active CA Authority, Clean Safety Record',
        description: 'Large 37-truck fleet based in Williams, CA. Active operating authority with full insurance coverage. Experienced drivers, established routes across the West Coast. Ready for immediate takeover with all contracts and relationships intact.',
        askingPrice: 285000,
        listingPrice: 275000,
        city: 'Williams',
        state: 'CA',
        yearsActive: 5,
        fleetSize: 37,
        totalDrivers: 37,
        safetyRating: SafetyRating.SATISFACTORY,
        amazonStatus: AmazonRelayStatus.NONE,
        highwaySetup: true,
        bipdCoverage: 1000000,
        cargoCoverage: 100000,
        isPremium: true,
        isVip: true,
        sellerId: seller.id,
      },
      {
        mcNumber: 'MC-986752',
        dotNumber: '2976210',
        legalName: 'KOCH EXPRESS INC',
        title: '12-Truck Fleet — Illinois Based, Active Authority',
        description: 'Established 12-truck carrier operating out of Lisle, IL. Active operating authority with proven track record. Full CDL driver roster, insurance current. Great mid-size acquisition opportunity with room to grow.',
        askingPrice: 165000,
        listingPrice: 155000,
        city: 'Lisle',
        state: 'IL',
        yearsActive: 6,
        fleetSize: 12,
        totalDrivers: 12,
        safetyRating: SafetyRating.SATISFACTORY,
        amazonStatus: AmazonRelayStatus.ACTIVE,
        highwaySetup: true,
        bipdCoverage: 750000,
        cargoCoverage: 100000,
        isPremium: false,
        isVip: false,
        sellerId: seller.id,
      },
    ];

    let created = 0;
    for (const data of realListings) {
      const existing = await Listing.findOne({ where: { dotNumber: data.dotNumber } });
      if (existing) {
        console.log(`Listing already exists for DOT ${data.dotNumber} — skipping`);
        continue;
      }

      await Listing.create({
        ...data,
        status: ListingStatus.ACTIVE,
        visibility: ListingVisibility.PUBLIC,
        insuranceOnFile: true,
        sellingWithEmail: true,
        sellingWithPhone: true,
        contactEmail: seller.email || 'seller@test.com',
        listingFeePaid: true,
        views: Math.floor(Math.random() * 200) + 50,
        saves: Math.floor(Math.random() * 30) + 5,
        publishedAt: new Date(),
      } as any);
      created++;
      console.log(`Created: ${data.legalName} (DOT ${data.dotNumber})`);
    }

    console.log(`\nDone! ${created} real carrier listings created.`);
    console.log('These have real DOT numbers that will pull data from the MorPro Carrier API.');
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
}

seedRealCarriers();
