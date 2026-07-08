const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const BASE_URL = 'https://www.footarchives.com';
const resultsFile = 'matches.json';

// دالة لاستخراج بيانات المباراة من رابط المقال
async function scrapeMatchDetails(matchUrl) {
    try {
        const { data } = await axios.get(matchUrl);
        const $ = cheerio.load(data);

        // استخراج العنوان (تحتاج لتعديل الـ Selector حسب هيكل الموقع الفعلي)
        const title = $('h1.post-title, h3.post-title').text().trim() || 'مباراة بدون عنوان';
        
        let videos = {};
        const iframes = $('iframe[src*="dailymotion.com"]');

        if (iframes.length > 0) {
            // غالباً الـ iframe الأول هو الشوط الأول، والثاني هو الشوط الثاني
            videos.first_half = $(iframes[0]).attr('src');
            
            if (iframes.length > 1) {
                videos.second_half = $(iframes[1]).attr('src');
            }
        }

        return {
            title,
            url: matchUrl,
            videos
        };
    } catch (error) {
        console.error(`خطأ في جلب تفاصيل المباراة ${matchUrl}:`, error.message);
        return null;
    }
}

// الدالة الرئيسية للتنقل عبر الصفحات
async function scrapeAllMatches() {
    let currentUrl = BASE_URL;
    let allMatches = [];
    let pageCount = 1;

    console.log('بدأ استخراج البيانات...');

    while (currentUrl) {
        console.log(`جاري سحب الصفحة رقم: ${pageCount} - ${currentUrl}`);
        
        try {
            const { data } = await axios.get(currentUrl);
            const $ = cheerio.load(data);

            // استخراج روابط المباريات في الصفحة الحالية
            // (يجب التأكد من كلاس الروابط في الموقع، هنا افترضنا أنها داخل .post-title a)
            const matchLinks = [];
            $('.post-title a, h3 a').each((i, el) => {
                const link = $(el).attr('href');
                if (link && !matchLinks.includes(link)) {
                    matchLinks.push(link);
                }
            });

            // جلب تفاصيل كل مباراة في الصفحة
            for (const link of matchLinks) {
                const matchData = await scrapeMatchDetails(link);
                if (matchData && Object.keys(matchData.videos).length > 0) {
                    allMatches.push(matchData);
                }
            }

            // البحث عن رابط "الصفحة التالية" للانتقال للمباريات الأقدم
            const nextLink = $('a.blog-pager-older-link, a.next-page-link').attr('href');
            
            if (nextLink) {
                currentUrl = nextLink;
                pageCount++;
            } else {
                currentUrl = null; // التوقف عند عدم وجود صفحة تالية
            }

        } catch (error) {
            console.error(`خطأ في سحب الصفحة ${currentUrl}:`, error.message);
            break; 
        }
    }

    // حفظ البيانات في ملف JSON
    // الترتيب سيكون طبيعياً الأحدث أولاً لأننا بدأنا من الصفحة الرئيسية
    fs.writeFileSync(resultsFile, JSON.stringify(allMatches, null, 2), 'utf8');
    console.log(`تم الانتهاء بنجاح! إجمالي المباريات المستخرجة: ${allMatches.length}`);
}

scrapeAllMatches();
