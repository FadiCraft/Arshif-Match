const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.footarchives.com';
const HOME_URL = 'https://www.footarchives.com/p/last-matches.html';

const matchDir = path.join(__dirname, 'match');
const homeFile = path.join(__dirname, 'Home.json');

// 1. دالة لاستخراج بيانات المباراة من رابط المقال (لجلب الروابط وتفاصيل الفيديو)
async function scrapeMatchDetails(matchUrl) {
    try {
        const { data } = await axios.get(matchUrl);
        const $ = cheerio.load(data);

        let title = $('meta[property="og:title"]').attr('content');
        if (!title) {
            title = $('a.Title, h1.post-title, h3.post-title').first().text().trim() || ' بدون عنوان';
        }
        
        let img = $('meta[property="og:image"]').attr('content');
        if (!img) {
            img = $('.post-body img').first().attr('src') || '';
        }

        let timeText = $('.published, .post-timestamp, .date-header, time').first().text().trim();
        if (!timeText) {
             timeText = $('meta[property="article:published_time"]').attr('content') || 'غير معروف';
        }

        let first_half = "";
        let second_half = "";
        const iframes = $('iframe[src*="dailymotion.com"]');

        if (iframes.length > 0) {
            first_half = $(iframes[0]).attr('src');
            if (iframes.length > 1) {
                second_half = $(iframes[1]).attr('src');
            }
        }

        return {
            title: title,
            url: matchUrl,
            first_half: first_half,
            second_half: second_half,
            img: img,
            Time: timeText
        };
    } catch (error) {
        console.error(`خطأ في جلب تفاصيل المباراة ${matchUrl}:`, error.message);
        return null;
    }
}

// 2. دالة لسحب أحدث المباريات بنفس الترتيب والفصل حسب الدوري للملف Home.json
async function scrapeHomeMatchesGrouped() {
    console.log('جاري سحب المباريات الرئيسية بالترتيب والفصل حسب الدوريات...');
    try {
        const { data } = await axios.get(HOME_URL);
        const $ = cheerio.load(data);
        const homeData = [];

        // البحث عن جميع حاويات الدوريات
        const leagueContainers = $('.league-container').toArray();

        for (const container of leagueContainers) {
            // استخراج اسم الدوري
            const leagueName = $(container).find('.league-header').text().trim();
            const matches = [];

            // استخراج كروت المباريات داخل هذا الدوري حصراً
            const matchCards = $(container).find('.match-card a.match-link').toArray();
            
            for (const card of matchCards) {
                const matchUrl = $(card).attr('href');
                if (matchUrl) {
                    const matchDetails = await scrapeMatchDetails(matchUrl);
                    // حفظ المباراة إذا كان بها روابط فيديو
                    if (matchDetails && (matchDetails.first_half || matchDetails.second_half)) {
                        matches.push(matchDetails);
                    }
                }
            }

            // إذا كان الدوري يحتوي على مباريات، يتم إضافته لملف الـ JSON
            if (matches.length > 0) {
                homeData.push({
                    league: leagueName,
                    matches: matches
                });
            }
        }

        fs.writeFileSync(homeFile, JSON.stringify(homeData, null, 2), 'utf8');
        console.log(`تم حفظ المباريات الرئيسية (مفصولة بالدوريات) بنجاح في: ${homeFile}`);

    } catch (error) {
        console.error('خطأ في سحب صفحة المباريات الأخيرة:', error.message);
    }
}

// 3. دالة لسحب كل المباريات من الأرشيف وتقسيمها لملفات 500 مباراة
async function scrapeArchiveMatches() {
    let currentUrl = BASE_URL;
    let allMatches = [];
    let pageCount = 1;

    console.log('\nبدأ استخراج أرشيف المباريات الكامل...');

    while (currentUrl) {
        console.log(`جاري سحب الصفحة الأرشيفية رقم: ${pageCount} - ${currentUrl}`);
        
        try {
            const { data } = await axios.get(currentUrl);
            const $ = cheerio.load(data);
            const matchLinks = [];
            
            $('.post-title a, h3 a, h2 a').each((i, el) => {
                const link = $(el).attr('href');
                if (link && !matchLinks.includes(link)) {
                    matchLinks.push(link);
                }
            });

            for (const link of matchLinks) {
                const matchData = await scrapeMatchDetails(link);
                if (matchData && (matchData.first_half || matchData.second_half)) {
                    allMatches.push(matchData);
                }
            }

            const nextLink = $('a.blog-pager-older-link, a.next-page-link').attr('href');
            if (nextLink) {
                currentUrl = nextLink;
                pageCount++;
            } else {
                currentUrl = null; 
            }

        } catch (error) {
            console.error(`خطأ في سحب الصفحة ${currentUrl}:`, error.message);
            break; 
        }
    }

    if (!fs.existsSync(matchDir)){
        fs.mkdirSync(matchDir, { recursive: true });
    }

    const chunkSize = 500;
    let fileIndex = 1;
    
    for (let i = 0; i < allMatches.length; i += chunkSize) {
        const chunk = allMatches.slice(i, i + chunkSize);
        const filePath = path.join(matchDir, `p${fileIndex}.json`);
        fs.writeFileSync(filePath, JSON.stringify(chunk, null, 2), 'utf8');
        fileIndex++;
    }

    console.log(`\nتم استخراج إجمالي: ${allMatches.length} مباراة أرشيفية.`);
    console.log(`تم تقسيمها وحفظها (${chunkSize} مباراة لكل ملف) في مجلد: /match`);
}

// دالة التشغيل الرئيسية
async function runScraper() {
    // 1. سحب الصفحة الرئيسية المنظمة
    await scrapeHomeMatchesGrouped();
    
    // 2. سحب الأرشيف الكامل
    await scrapeArchiveMatches();
    
    console.log('\n-----------------------------------');
    console.log('انتهت جميع عمليات السحب بنجاح!');
}

runScraper();
