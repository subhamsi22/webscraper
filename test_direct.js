const { scrapeGoogleBusiness } = require('./scraper');

async function test() {
  console.log('Testing updated scraper.js directly...');
  try {
    const result = await scrapeGoogleBusiness('Computer Hardware Company', 'Mumbai', { scrollMore: false });
    console.log('Success:', result.success);
    console.log('Count:', result.count);
    if (result.count > 0) {
      console.log('First lead:', result.data[0].company_name, '| Phone:', result.data[0].phone);
    }
  } catch (err) {
    console.error('Test error:', err);
  }
}

test();
