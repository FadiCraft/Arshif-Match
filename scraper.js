const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const BASE_URL = 'https://www.footarchives.com';
const allMatchesFile = 'AllMatches.json';
const homeFile = 'Home.json';

// دالة لاستخراج بيانات المباراة من رابط المقال
async function scrapeMatchDetails(matchUrl) {
    try {
        const { data } = await axios.get(matchUrl);
        const $ = cheerio.load(data);

        // العنوان
let title = $('meta[property="og:title"]').attr('content');

if (!title) {
    // في حال عدم وجود الميتا، نأخذ أول عنوان يقابلنا فقط لمنع تداخل النصوص
    title = $('a.Title, h1.post-title, h3.post-title').first().text().trim() || ' بدون عنوان';
}
        
        // الصورة (أفضل طريقة هي أخذها من الميتا تاج الخاص بالمشاركة)
        let img = $('meta[property="og:image"]').attr('content');
        if (!img) {
            // بديل في حال عدم وجود الميتا تاج: جلب أول صورة في المقال
            img = $('.post-body img').first().attr('src') || '';
        }

        // الوقت/التاريخ
        let timeText = $('.published, .post-timestamp, .date-header, time').first().text().trim();
        if (!timeText) {
             timeText = $('meta[property="article:published_time"]').attr('content') || 'غير معروف';
        }

        // الروابط
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

            const matchLinks = [];
            // استخراج روابط المقالات
            $('.post-title a, h3 a, h2 a').each((i, el) => {
                const link = $(el).attr('href');
                if (link && !matchLinks.includes(link)) {
                    matchLinks.push(link);
                }
            });

            for (const link of matchLinks) {
                const matchData = await scrapeMatchDetails(link);
                // حفظ المباراة فقط إذا وجدنا فيها روابط فيديو
                if (matchData && (matchData.first_half || matchData.second_half)) {
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

    // --- حفظ البيانات في ملفين ---
    
    // 1. ملف جميع المباريات
    fs.writeFileSync(allMatchesFile, JSON.stringify(allMatches, null, 2), 'utf8');
    
    // 2. ملف الصفحة الرئيسية (أحدث 30 مباراة فقط)
    // بما أن السكريبت يبدأ من الصفحة الأحدث، فأول 30 عنصر في المصفوفة هي الأحدث
    const homeMatches = allMatches.slice(0, 30);
    fs.writeFileSync(homeFile, JSON.stringify(homeMatches, null, 2), 'utf8');

    console.log('-----------------------------------');
    console.log(`تم الانتهاء بنجاح!`);
    console.log(`إجمالي المباريات المستخرجة: ${allMatches.length} (محفوظة في ${allMatchesFile})`);
    console.log(`أحدث 30 مباراة (محفوظة في ${homeFile})`);
}

scrapeAllMatches();
