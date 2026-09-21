import mongoose from "mongoose";
import { Website } from "../src/lib/models/Website";
import { User } from "../src/lib/models/User";
import { Page } from "../src/lib/models/Page";
import { Sitemap } from "../src/lib/models/Sitemap";
import { calculateNextScanAt } from "../src/lib/scanner/scanEngine";
import { detectWebsiteName, extractDomain, normalizeUrl } from "../src/lib/sitemap/normalizer";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/sitemap_monitor";

interface CompetitorSeedItem {
  rawUrl: string;
  category: "nutra" | "ecom";
  language: "en" | "de" | "fr" | "it";
  country: "US" | "DE" | "FR" | "IT";
  group: string;
  sitemapPath?: string;
  sampleProducts?: string[];
}

export const COMPETITOR_SEED_DATA: CompetitorSeedItem[] = [
  // -------------------------------------------------------------
  // 1. Nutra (English) (16 sites)
  // -------------------------------------------------------------
  {
    rawUrl: "https://healthfactsjournal.com/",
    category: "nutra",
    language: "en",
    country: "US",
    group: "Nutra (English)",
    sampleProducts: ["collagen-peptides-powder", "prosta-vital-complex", "turmeric-curcumin-gold"],
  },
  {
    rawUrl: "https://nuvectramedical.com/",
    category: "nutra",
    language: "en",
    country: "US",
    group: "Nutra (English)",
    sampleProducts: ["gluco-balance-formula", "neuro-clarity-capsules", "keto-burn-extreme"],
  },
  {
    rawUrl: "https://www.consumerhealthdigest.com/",
    category: "nutra",
    language: "en",
    country: "US",
    group: "Nutra (English)",
    sampleProducts: ["genesis-renew-cream", "joint-relief-911", "omega-3-krill-oil"],
  },
  {
    rawUrl: "https://supplementreviewreport.com/",
    category: "nutra",
    language: "en",
    country: "US",
    group: "Nutra (English)",
    sampleProducts: ["alpha-male-vitality", "collagen-renew-drops", "berberine-blood-sugar"],
  },
  {
    rawUrl: "https://bestsupplements.best/",
    category: "nutra",
    language: "en",
    country: "US",
    group: "Nutra (English)",
    sampleProducts: ["deep-sleep-melatonin", "digestive-enzyme-blend", "organic-greens-superfood"],
  },
  {
    rawUrl: "https://www.supplementcritique.com/",
    category: "nutra",
    language: "en",
    country: "US",
    group: "Nutra (English)",
    sampleProducts: ["testosterone-booster-ultra", "pre-workout-ignite", "nitric-oxide-pump"],
  },
  {
    rawUrl: "https://bestwellnesspicks.com/",
    category: "nutra",
    language: "en",
    country: "US",
    group: "Nutra (English)",
    sampleProducts: ["ashwagandha-stress-relief", "vitamin-d3-k2-drops", "probiotic-50-billion"],
  },
  {
    rawUrl: "https://supplementlab.org/",
    category: "nutra",
    language: "en",
    country: "US",
    group: "Nutra (English)",
    sampleProducts: ["apple-cider-vinegar-gummies", "marine-collagen-powder", "magnesium-glycinate"],
  },
  {
    rawUrl: "https://nutrasift.com/",
    category: "nutra",
    language: "en",
    country: "US",
    group: "Nutra (English)",
    sampleProducts: ["elderberry-immune-syrup", "pure-mct-oil", "lions-mane-mushroom-extract"],
  },
  {
    rawUrl: "https://www.supplementdiary.com/",
    category: "nutra",
    language: "en",
    country: "US",
    group: "Nutra (English)",
    sampleProducts: ["biotin-hair-growth", "coq10-heart-support", "l-theanine-calm"],
  },
  {
    rawUrl: "https://buysupplementadvisor.com/",
    category: "nutra",
    language: "en",
    country: "US",
    group: "Nutra (English)",
    sampleProducts: ["resveratrol-anti-aging", "electrolytes-hydration-mix", "glutathione-antioxidant"],
  },
  {
    rawUrl: "https://vitaminreviewer.com/",
    category: "nutra",
    language: "en",
    country: "US",
    group: "Nutra (English)",
    sampleProducts: ["multivitamin-daily-pack", "calcium-citrate-tablets", "zinc-picolinate"],
  },
  {
    rawUrl: "https://wellnesschecked.com/",
    category: "nutra",
    language: "en",
    country: "US",
    group: "Nutra (English)",
    sampleProducts: ["liver-cleanse-detox", "thyroid-support-complex", "cbg-sleep-gummies"],
  },
  {
    rawUrl: "https://nirahealthy.com/",
    category: "nutra",
    language: "en",
    country: "US",
    group: "Nutra (English)",
    sampleProducts: ["matcha-green-tea-latte", "organic-flaxseed-oil", "spirulina-chlorella-caps"],
  },
  {
    rawUrl: "https://homehealthyremedy.com/",
    category: "nutra",
    language: "en",
    country: "US",
    group: "Nutra (English)",
    sampleProducts: ["herbal-colon-cleanse", "bone-broth-protein", "saw-palmetto-extract"],
  },
  {
    rawUrl: "https://invictsreviews.com/",
    category: "nutra",
    language: "en",
    country: "US",
    group: "Nutra (English)",
    sampleProducts: ["example-fx", "glyco-shield-drops", "metabolism-booster-pro"],
  },

  // -------------------------------------------------------------
  // 2. Nutra (German) (12 sites)
  // -------------------------------------------------------------
  {
    rawUrl: "https://www.praxis-dr-grosse.de/",
    category: "nutra",
    language: "de",
    country: "DE",
    group: "Nutra (German)",
    sampleProducts: ["arthro-vital-komplex", "darm-flora-balance", "herz-aktiv-q10"],
  },
  {
    rawUrl: "https://produktpreis.com/",
    category: "nutra",
    language: "de",
    country: "DE",
    group: "Nutra (German)",
    sampleProducts: ["kollagen-pulver-plus", "curcuma-extrakt-kapseln", "zink-vitamin-c-depot"],
  },
  {
    rawUrl: "https://gesundheit-im-leben.com/",
    category: "nutra",
    language: "de",
    country: "DE",
    group: "Nutra (German)",
    sampleProducts: ["leber-vital-tropfen", "nerven-ruhe-magnesium", "augen-fit-lutein"],
  },
  {
    rawUrl: "https://www.hausarztpraxis-isartal.de/",
    category: "nutra",
    language: "de",
    country: "DE",
    group: "Nutra (German)",
    sampleProducts: ["blutdruck-balance-tee", "immunsystem-booster-bio", "vitamin-b-komplex-forte"],
  },
  {
    rawUrl: "https://www.revistaavft.com/de/",
    category: "nutra",
    language: "de",
    country: "DE",
    group: "Nutra (German)",
    sampleProducts: ["glukose-regulator-kapseln", "gelenk-schutz-900", "stoffwechsel-aktivator"],
  },
  {
    rawUrl: "https://www.mvz-pfeiffer.de/apotheke/",
    category: "nutra",
    language: "de",
    country: "DE",
    group: "Nutra (German)",
    sampleProducts: ["omega-3-lachs-oel", "haar-wuchs-biotin", "melatonin-einschlaf-spray"],
  },
  {
    rawUrl: "https://www.rheumapraxen-bdrh.de/apotheke/",
    category: "nutra",
    language: "de",
    country: "DE",
    group: "Nutra (German)",
    sampleProducts: ["weihrauch-extrakt-boswellia", "msm-gelenk-pulver", "hyaluron-forte-kapseln"],
  },
  {
    rawUrl: "https://katholisches-klinikum.de/apotheke/",
    category: "nutra",
    language: "de",
    country: "DE",
    group: "Nutra (German)",
    sampleProducts: ["multivitamin-vital-senioren", "eisen-sanft-depot", "probiotika-darm-kur"],
  },
  {
    rawUrl: "https://iibmed.com/de/",
    category: "nutra",
    language: "de",
    country: "DE",
    group: "Nutra (German)",
    sampleProducts: ["keto-aktiv-tropfen", "detox-leber-kur", "chili-fatburner-kapseln"],
  },
  {
    rawUrl: "https://www.shop-apotheke.com/",
    category: "nutra",
    language: "de",
    country: "DE",
    group: "Nutra (German)",
    sampleProducts: ["apotheken-d3-k2-oel", "magnesium-direct-sticks", "cranberry-blasen-schutz"],
  },
  {
    rawUrl: "https://www.health-supplement-facts.com/",
    category: "nutra",
    language: "de",
    country: "DE",
    group: "Nutra (German)",
    sampleProducts: ["testo-kraft-booster", "creatin-monohydrat-creapure", "whey-protein-vanille"],
  },
  {
    rawUrl: "https://apotheken-ratgeber.net/",
    category: "nutra",
    language: "de",
    country: "DE",
    group: "Nutra (German)",
    sampleProducts: ["schnarch-stopp-spray", "venen-gel-rosskastanie", "schlaf-gut-lavendel-oel"],
  },

  // -------------------------------------------------------------
  // 3. Nutra (French) (3 sites)
  // -------------------------------------------------------------
  {
    rawUrl: "https://avis-et-prix.com/",
    category: "nutra",
    language: "fr",
    country: "FR",
    group: "Nutra (French)",
    sampleProducts: ["bruleur-de-graisse-naturel", "collagene-marin-anti-age", "cure-detox-minceur"],
  },
  {
    rawUrl: "https://diet-ethique.eu/",
    category: "nutra",
    language: "fr",
    country: "FR",
    group: "Nutra (French)",
    sampleProducts: ["gelules-artichaut-radis-noir", "spiruline-biologique-france", "probiotiques-flore-intime"],
  },
  {
    rawUrl: "https://musclepower.fr/",
    category: "nutra",
    language: "fr",
    country: "FR",
    group: "Nutra (French)",
    sampleProducts: ["isolate-whey-chocolat", "bcaa-glutamine-recuperation", "creatine-creapure-poudre"],
  },

  // -------------------------------------------------------------
  // 4. Nutra (Italian) (3 sites)
  // -------------------------------------------------------------
  {
    rawUrl: "https://www.pluspowersupplements.com/",
    category: "nutra",
    language: "it",
    country: "IT",
    group: "Nutra (Italian)",
    sampleProducts: ["integratore-bruciagrassi-forte", "collagene-acido-ialuronico", "multivitaminico-completo"],
  },
  {
    rawUrl: "https://afnutrition.it/",
    category: "nutra",
    language: "it",
    country: "IT",
    group: "Nutra (Italian)",
    sampleProducts: ["proteine-del-siero-del-latte", "aminoacidi-ramificati-bcaa", "termogenico-definizione"],
  },
  {
    rawUrl: "https://www.nutritrade.it/",
    category: "nutra",
    language: "it",
    country: "IT",
    group: "Nutra (Italian)",
    sampleProducts: ["omega-3-olio-di-pesce-puro", "spirulina-bio-compresse", "melatonina-sonno-notturno"],
  },

  // -------------------------------------------------------------
  // 5. E-Com (English) (7 sites)
  // -------------------------------------------------------------
  {
    rawUrl: "https://thegearledger.com/",
    category: "ecom",
    language: "en",
    country: "US",
    group: "E-Com (English)",
    sampleProducts: ["tactical-flashlight-ultra", "wireless-car-vacuum", "smart-gps-tracker-mini"],
  },
  {
    rawUrl: "https://www.gadgetshall.com/",
    category: "ecom",
    language: "en",
    country: "US",
    group: "E-Com (English)",
    sampleProducts: ["portable-air-cooler-pro", "bone-conduction-headphones", "laser-tape-measure-digital"],
  },
  {
    rawUrl: "https://innovgadget.com/",
    category: "ecom",
    language: "en",
    country: "US",
    group: "E-Com (English)",
    sampleProducts: ["solar-power-bank-rugged", "anti-theft-backpack-usb", "wireless-charging-stand-3in1"],
  },
  {
    rawUrl: "https://www.snoopviews.com/",
    category: "ecom",
    language: "en",
    country: "US",
    group: "E-Com (English)",
    sampleProducts: ["dashcam-front-rear-4k", "smart-water-flosser", "ergonomic-lumbar-cushion"],
  },
  {
    rawUrl: "https://inmybowl.com/",
    category: "ecom",
    language: "en",
    country: "US",
    group: "E-Com (English)",
    sampleProducts: ["biopeak-reviews", "scalpistry-hair-oil", "organifi-happy-drops"],
  },
  {
    rawUrl: "https://www.webhealthbuzz.com/ecom/",
    category: "ecom",
    language: "en",
    country: "US",
    group: "E-Com (English)",
    sampleProducts: ["knee-compression-brace", "posture-corrector-magnetic", "heated-massage-pillow"],
  },

  // -------------------------------------------------------------
  // 6. E-Com (German) (10 sites)
  // -------------------------------------------------------------
  {
    rawUrl: "https://checkzentrum.de/",
    category: "ecom",
    language: "de",
    country: "DE",
    group: "E-Com (German)",
    sampleProducts: ["mini-klimaanlage-polar-fresh", "drohne-4k-kamera-pro", "akkusauger-handlich-stark"],
  },
  {
    rawUrl: "https://thegearledger.com/de",
    category: "ecom",
    language: "de",
    country: "DE",
    group: "E-Com (German)",
    sampleProducts: ["taktische-led-taschenlampe", "mobiler-kompressor-auto", "smart-fitness-tracker-uhr"],
  },
  {
    rawUrl: "https://www.adac.de/",
    category: "ecom",
    language: "de",
    country: "DE",
    group: "E-Com (German)",
    sampleProducts: ["kfz-verbandkasten-din", "warndreieck-kompakt", "starthilfekabel-vollkupfer"],
  },
  {
    rawUrl: "https://www.tomorrow-focus.de/",
    category: "ecom",
    language: "de",
    country: "DE",
    group: "E-Com (German)",
    sampleProducts: ["stromspar-thermostat-wlan", "solar-gartenleuchten-set", "luftreiniger-hepa13-filter"],
  },
  {
    rawUrl: "https://hoehle-loewen.de/",
    category: "ecom",
    language: "de",
    country: "DE",
    group: "E-Com (German)",
    sampleProducts: ["innovative-buersten-reinigung", "nachhaltige-kaffeekapseln", "anti-schwitz-unterhemd"],
  },
  {
    rawUrl: "https://ratifyo.com/",
    category: "ecom",
    language: "de",
    country: "DE",
    group: "E-Com (German)",
    sampleProducts: ["insekten-vernichter-elektrisch", "fensterputz-roboter-smart", "wasserfilter-krug-glas"],
  },
  {
    rawUrl: "https://www.besteerfahrungen.de/",
    category: "ecom",
    language: "de",
    country: "DE",
    group: "E-Com (German)",
    sampleProducts: ["orthopaedisches-nackenkissen", "wlan-verstaerker-repeater", "ultraschall-zahnbuerste"],
  },
  {
    rawUrl: "https://thegadgetforge.com/",
    category: "ecom",
    language: "de",
    country: "DE",
    group: "E-Com (German)",
    sampleProducts: ["outdoor-feuerstarter-survival", "wasserfeste-bluetooth-box", "camping-solarlampe"],
  },
  {
    rawUrl: "https://reviewgadgetss.com/de/",
    category: "ecom",
    language: "de",
    country: "DE",
    group: "E-Com (German)",
    sampleProducts: ["sicherheits-kamera-kabellos", "auto-kratzer-entferner-paste", "led-stirnlampe-sensor"],
  },
];

export async function seedCompetitors() {
  console.log(`Connecting to MongoDB at: ${MONGODB_URI}`);
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB.");

  const users = await User.find({}).lean();
  if (users.length === 0) {
    console.log("No users found in database. Please register or seed a user first.");
    return;
  }

  console.log(`Found ${users.length} users. Seeding ${COMPETITOR_SEED_DATA.length} competitor sites for all users...`);

  let totalInserted = 0;
  let totalUpdated = 0;

  for (const user of users) {
    console.log(`\nProcessing user: ${user.email} (${user._id})...`);

    // Ensure baseline sites for this user have category and language
    await Website.updateMany(
      { userId: user._id, isPrimary: true },
      { $set: { category: "nutra", language: "en", country: "US" } }
    );

    for (const item of COMPETITOR_SEED_DATA) {
      let cleanUrl = item.rawUrl.trim();
      if (!cleanUrl.startsWith("http")) {
        cleanUrl = `https://${cleanUrl}`;
      }
      const domain = extractDomain(cleanUrl);
      const name = detectWebsiteName(cleanUrl) || domain;
      const sitemapUrl = item.sitemapPath
        ? `${cleanUrl.replace(/\/$/, "")}/${item.sitemapPath.replace(/^\//, "")}`
        : `${cleanUrl.replace(/\/$/, "")}/sitemap.xml`;

      // Check if this competitor website already exists for this user
      let website = await Website.findOne({
        userId: user._id,
        $or: [{ domain }, { url: cleanUrl }],
      });

      if (!website) {
        website = await Website.create({
          userId: user._id,
          name,
          url: cleanUrl,
          domain,
          sitemapUrl,
          isPrimary: false,
          isActive: true,
          category: item.category,
          language: item.language,
          country: item.country,
          scanFrequency: "24h",
          nextScanAt: calculateNextScanAt("24h"),
          lastScanAt: new Date(Date.now() - Math.floor(Math.random() * 24 * 60 * 60 * 1000)),
          lastScanStatus: "healthy",
          totalUrls: item.sampleProducts?.length ? item.sampleProducts.length + 5 : 15,
          missingUrlsCount: item.sampleProducts?.length || 3,
          newUrlsCount: 1,
        });
        totalInserted++;
      } else {
        // Update category, language, and country if they were missing or outdated
        website.category = item.category;
        website.language = item.language;
        website.country = item.country;
        if (!website.sitemapUrl) website.sitemapUrl = sitemapUrl;
        await website.save();
        totalUpdated++;
      }

      // Ensure sitemap and sample pages exist for this competitor so comparisons work immediately
      const sitemapDoc = await Sitemap.findOneAndUpdate(
        { websiteId: website._id, url: sitemapUrl },
        {
          $setOnInsert: {
            websiteId: website._id,
            url: sitemapUrl,
            status: "active",
            urlsCount: item.sampleProducts?.length || 5,
            lastCheckedAt: new Date(),
          },
        },
        { upsert: true, new: true }
      );

      if (item.sampleProducts && item.sampleProducts.length > 0) {
        for (const slug of item.sampleProducts) {
          const pageUrl = `${cleanUrl.replace(/\/$/, "")}/products/${slug}`;
          const normalizedUrl = normalizeUrl(pageUrl);

          await Page.findOneAndUpdate(
            { websiteId: website._id, normalizedUrl },
            {
              $setOnInsert: {
                websiteId: website._id,
                sitemapId: sitemapDoc._id,
                url: pageUrl,
                normalizedUrl,
                lastmod: new Date(),
                changefreq: "daily",
                priority: 0.8,
                isActive: true,
                firstSeenAt: new Date(),
                lastSeenAt: new Date(),
              },
            },
            { upsert: true }
          );
        }
      }
    }
  }

  console.log(`\n✓ Competitor seeding complete!`);
  console.log(`- Created: ${totalInserted} website entries`);
  console.log(`- Updated: ${totalUpdated} website entries`);
}

// Run directly if invoked from CLI
if (require.main === module || process.argv[1]?.includes("seedCompetitors")) {
  seedCompetitors()
    .then(() => {
      console.log("Seeding script executed successfully.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Error running seedCompetitors:", err);
      process.exit(1);
    });
}
