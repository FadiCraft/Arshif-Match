const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path'); // إضافة مكتبة path للتعامل مع المجلدات

const BASE_URL = 'https://www.footarchives.com';
const matchDir = path.join(__dirname, 'match'); // مسار مجلد المباريات
const homeFile = path.join(__dirname, 'Home.json'); // مسار ملف الرئيسية

// دالة لاستخراج بيانات المباراة من رابط المقال
async function scrapeMatchDetails(matchUrl) {
    try {
        const { data } = await axios.get(matchUrl);
        const $ = cheerio.load(data);

        // العنوان
        let title = $('meta[property="og:title"]').attr('content');
        if (!title) {
            title = $('a.Title, h1.post-title, h3.post-title').first().text().trim() || ' بدون عنوان';
        }
        
        // الصورة 
        let img = $('meta[property="og:image"]').attr('content');
        if (!img) {
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

// الدالة الرئيسية
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
                currentUrl = null; 
            }

        } catch (error) {
            console.error(`خطأ في سحب الصفحة ${currentUrl}:`, error.message);
            break; 
        }
    }

    // --- معالجة وحفظ البيانات ---
    console.log('جاري معالجة وحفظ الملفات...');

    // 1. ملف الصفحة الرئيسية (أحدث 30 مباراة)
    const homeMatches = allMatches.slice(0, 30);
    fs.writeFileSync(homeFile, JSON.stringify(homeMatches, null, 2), 'utf8');

    // 2. إنشاء مجلد /match إذا لم يكن موجوداً
    if (!fs.existsSync(matchDir)){
        fs.mkdirSync(matchDir, { recursive: true });
    }

    // 3. تقسيم باقي المباريات (أو كل المباريات) إلى ملفات، كل ملف 500 مباراة
    const chunkSize = 500;
    let fileIndex = 1;
    
    for (let i = 0; i < allMatches.length; i += chunkSize) {
        // اقتطاع 500 مباراة
        const chunk = allMatches.slice(i, i + chunkSize);
        
        // مسار الملف واسمه (مثال: match/p1.json)
        const filePath = path.join(matchDir, `p${fileIndex}.json`);
        
        // حفظ الملف
        fs.writeFileSync(filePath, JSON.stringify(chunk, null, 2), 'utf8');
        
        fileIndex++;
    }

    console.log('-----------------------------------');
    console.log(`تم الانتهاء بنجاح!`);
    console.log(`إجمالي المباريات المستخرجة: ${allMatches.length}`);
    console.log(`تم حفظ أحدث 30 مباراة في: ${homeFile}`);
    console.log(`تم حفظ جميع المباريات مقسمة (${chunkSize} مباراة لكل ملف) في مجلد: /match`);
}

scrapeAllMatches();
