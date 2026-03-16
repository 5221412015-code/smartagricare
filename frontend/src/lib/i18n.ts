/**
 * Simple i18n translation system for SmartAgriCare.
 * Supports: English (en), Hindi (hi), Telugu (te)
 */

type Language = 'en' | 'hi' | 'te';

const translations: Record<string, Record<Language, string>> = {
    // Dashboard
    'hi_user': { en: 'Hi, {name} 👋', hi: 'नमस्ते, {name} 👋', te: 'హాయ్, {name} 👋' },
    'welcome_back': { en: 'Welcome back!', hi: 'वापस स्वागत है!', te: 'తిరిగి స్వాగతం!' },
    'recent_activity': { en: 'My Recent Activity', hi: 'मेरी हालिया गतिविधि', te: 'నా ఇటీవలి కార్యాచరణ' },
    'see_all': { en: 'See All', hi: 'सब देखें', te: 'అన్నీ చూడండి' },
    'humidity': { en: 'Humidity', hi: 'नमी', te: 'తేమ' },
    'precipitation': { en: 'Precip.', hi: 'वर्षा', te: 'వర్షపాతం' },
    'wind': { en: 'Wind', hi: 'हवा', te: 'గాలి' },
    'feels_like': { en: 'Feels like', hi: 'अनुभव', te: 'అనుభవం' },
    'uv_index': { en: 'UV Index', hi: 'UV सूचकांक', te: 'UV సూచిక' },
    'today': { en: 'Today', hi: 'आज', te: 'ఈరోజు' },
    'forecast': { en: 'Forecast', hi: 'पूर्वानुमान', te: 'అంచనా' },
    'day_sun': { en: 'Sun', hi: 'रवि', te: 'ఆది' },
    'day_mon': { en: 'Mon', hi: 'सोम', te: 'సోమ' },
    'day_tue': { en: 'Tue', hi: 'मंगल', te: 'మంగ' },
    'day_wed': { en: 'Wed', hi: 'बुध', te: 'బుధ' },
    'day_thu': { en: 'Thu', hi: 'गुरु', te: 'గురు' },
    'day_fri': { en: 'Fri', hi: 'शुक्र', te: 'శుక్ర' },
    'day_sat': { en: 'Sat', hi: 'शनि', te: 'శని' },
    'loading_map': { en: 'Loading map...', hi: 'नक्शा लोड हो रहा है...', te: 'మ్యాప్ లోడ్ అవుతోంది...' },

    // Activities
    'disease_detection': { en: 'Disease Detection', hi: 'रोग पहचान', te: 'వ్యాధి గుర్తింపు' },
    'crop_recommendation': { en: 'Crop Recommendation', hi: 'फसल सिफारिश', te: 'పంట సిఫార్సు' },
    'local_stores': { en: 'Local Stores', hi: 'स्थानीय दुकानें', te: 'స్థానిక దుకాణాలు' },
    'language': { en: 'Language', hi: 'भाषा', te: 'భాష' },
    'choose_language': { en: 'Choose Language', hi: 'भाषा चुनें', te: 'భాష ఎంచుకోండి' },
    'tap_to_apply': { en: 'Tap to apply instantly', hi: 'तुरंत लागू करने के लिए टैप करें', te: 'వెంటనే అమలు చేయడానికి నొక్కండి' },

    // Disease Detection
    'upload_diagnose': { en: 'Upload or capture a plant image to diagnose', hi: 'निदान के लिए पौधे की तस्वीर अपलोड या कैप्चर करें', te: 'రోగ నిర్ధారణ కోసం మొక్క చిత్రాన్ని అప్‌లోడ్ చేయండి' },
    'take_photo': { en: 'Take Photo', hi: 'फोटो लें', te: 'ఫోటో తీయండి' },
    'use_camera': { en: 'Use your camera', hi: 'कैमरा उपयोग करें', te: 'మీ కెమెరా ఉపయోగించండి' },
    'upload_gallery': { en: 'Upload from Gallery', hi: 'गैलरी से अपलोड करें', te: 'గ్యాలరీ నుండి అప్‌లోడ్ చేయండి' },
    'browse_files': { en: 'Browse your files', hi: 'अपनी फाइलें ब्राउज़ करें', te: 'మీ ఫైల్‌లను బ్రౌజ్ చేయండి' },
    'analysis_complete': { en: 'Analysis Complete', hi: 'विश्लेषण पूर्ण', te: 'విశ్లేషణ పూర్తయింది' },
    'cause_of_disease': { en: 'Cause of Disease', hi: 'रोग का कारण', te: 'వ్యాధి కారణం' },
    'treatment': { en: 'Treatment', hi: 'उपचार', te: 'చికిత్స' },
    'medication_timeline': { en: 'Medication Timeline', hi: 'दवा समयरेखा', te: 'మందు సమయపట్టిక' },
    'nearby_stores': { en: 'Nearby Stores', hi: 'नजदीकी दुकानें', te: 'సమీపంలోని దుకాణాలు' },
    'save_report': { en: 'Save Report', hi: 'रिपोर्ट सहेजें', te: 'నివేదిక సేవ్ చేయండి' },
    'scan_another': { en: 'Scan Another', hi: 'और स्कैन करें', te: 'మరొకటి స్కాన్ చేయండి' },
    'report_saved': { en: 'Report saved successfully!', hi: 'रिपोर्ट सफलतापूर्वक सहेजी गई!', te: 'నివేదిక విజయవంతంగా సేవ్ చేయబడింది!' },
    'viral_warning': { en: 'Viral Disease Warning', hi: 'वायरल रोग चेतावनी', te: 'వైరల్ వ్యాధి హెచ్చరిక' },
    'medication_schedule': { en: 'Medication Schedule', hi: 'दवा अनुसूची', te: 'మందుల షెడ్యూల్' },
    'quantity': { en: 'Qty/Acre', hi: 'मात्रा/एकड़', te: 'పరిమాణం/ఎకరం' },
    'water': { en: 'Water', hi: 'पानी', te: 'నీరు' },
    'when': { en: 'When', hi: 'कब', te: 'ఎప్పుడు' },
    'repeat': { en: 'Repeat', hi: 'दोहराएं', te: 'పునరావృతం' },
    'duration': { en: 'Duration', hi: 'अवधि', te: 'వ్యవధి' },
    'max_sprays': { en: 'Max sprays', hi: 'अधिकतम छिड़काव', te: 'గరిష్ట పిచికారీలు' },
    'healthy_crop': { en: 'Healthy Crop!', hi: 'स्वस्थ फसल!', te: 'ఆరోగ్యకరమైన పంట!' },
    'no_disease_detected': { en: 'No disease detected. Your crop is healthy.', hi: 'कोई रोग नहीं पाया गया। आपकी फसल स्वस्थ है।', te: 'వ్యాధి కనుగొనబడలేదు. మీ పంట ఆరోగ్యంగా ఉంది.' },
    'confidence': { en: 'Confidence', hi: 'विश्वास', te: 'విశ్వాసం' },
    'not_recognized': { en: 'Image Not Recognized', hi: 'छवि पहचान नहीं हुई', te: 'చిత్రం గుర్తించబడలేదు' },
    'not_plant_image': { en: 'This image does not appear to be a crop leaf. Please upload a clear, close-up photo of the affected leaf.', hi: 'यह छवि फसल की पत्ती नहीं लगती। कृपया प्रभावित पत्ती की स्पष्ट तस्वीर अपलोड करें।', te: 'ఈ చిత్రం పంట ఆకుగా కనిపించడం లేదు. దయచేసి ప్రభావిత ఆకు యొక్క స్పష్టమైన ఫోటో అప్‌లోడ్ చేయండి.' },
    'deficiencies': { en: 'Nutrient Deficiencies', hi: 'पोषक तत्वों की कमी', te: 'పోషక లోపాలు' },
    'disorders': { en: 'Plant Disorders', hi: 'पौधों के विकार', te: 'మొక్క రుగ్మతలు' },
    'organic_treatment': { en: 'Organic / Natural Treatment', hi: 'जैविक / प्राकृतिक उपचार', te: 'సేంద్రీయ / సహజ చికిత్స' },
    'chemical_treatment': { en: 'Chemical Treatment', hi: 'रासायनिक उपचार', te: 'రసాయన చికిత్స' },

    // Crop Recommendation
    'get_ai_suggestions': { en: 'Get AI-based crop suggestions', hi: 'AI आधारित फसल सुझाव प्राप्त करें', te: 'AI ఆధారిత పంట సూచనలు పొందండి' },
    'soil_type': { en: '🌍 Soil Type', hi: '🌍 मिट्टी का प्रकार', te: '🌍 నేల రకం' },
    'growing_season': { en: '📅 Growing Season', hi: '📅 उगाने का मौसम', te: '📅 పంట సీజన్' },
    'water_availability': { en: '💧 Water Availability', hi: '💧 पानी की उपलब्धता', te: '💧 నీటి లభ్యత' },
    'district': { en: '📍 District', hi: '📍 जिला', te: '📍 జిల్లా' },
    'acres_of_land': { en: '📐 Acres of Land', hi: '📐 भूमि (एकड़)', te: '📐 భూమి (ఎకరాలు)' },
    'get_recommendations': { en: 'Get Recommendations', hi: 'सिफारिशें प्राप्त करें', te: 'సిఫార్సులు పొందండి' },
    'recommended_crops': { en: 'Recommended Crops', hi: 'अनुशंसित फसलें', te: 'సిఫార్సు చేసిన పంటలు' },
    'modify': { en: 'Modify', hi: 'बदलें', te: 'మార్చండి' },
    'select_district': { en: 'Select District', hi: 'जिला चुनें', te: 'జిల్లా ఎంచుకోండి' },

    // Crop Rec — Soil types
    'soil_red': { en: 'Red Soil', hi: 'लाल मिट्टी', te: 'ఎర్ర నేల' },
    'soil_red_desc': { en: 'Iron-rich', hi: 'लौह-समृद्ध', te: 'ఇనుము అధికం' },
    'soil_black_cotton': { en: 'Black Cotton', hi: 'काली कपास', te: 'నల్ల రేగడి' },
    'soil_black_cotton_desc': { en: 'Moisture retentive', hi: 'नमी बनाए रखने वाली', te: 'తేమ నిలుపుకునే' },
    'soil_alluvial': { en: 'Alluvial', hi: 'जलोढ़', te: 'ఒండ్రు నేల' },
    'soil_alluvial_desc': { en: 'River delta', hi: 'नदी डेल्टा', te: 'నది డెల్టా' },
    'soil_laterite': { en: 'Laterite', hi: 'लैटेराइट', te: 'లాటరైట్' },
    'soil_laterite_desc': { en: 'Leached, acidic', hi: 'अम्लीय', te: 'ఆమ్ల, క్షీణించిన' },
    'soil_sandy': { en: 'Sandy', hi: 'रेतीली', te: 'ఇసుక నేల' },
    'soil_sandy_desc': { en: 'Light, low nutrients', hi: 'हल्की, कम पोषक', te: 'తేలిక, తక్కువ పోషకాలు' },
    'soil_coastal_saline': { en: 'Coastal Saline', hi: 'तटीय लवणीय', te: 'తీర లవణ' },
    'soil_coastal_saline_desc': { en: 'Salt-affected', hi: 'लवण प्रभावित', te: 'ఉప్పు ప్రభావిత' },
    'soil_clay': { en: 'Clay', hi: 'चिकनी मिट्टी', te: 'బంక మట్టి' },
    'soil_clay_desc': { en: 'Heavy, water-logging', hi: 'भारी, जल भराव', te: 'భారీ, నీరు నిల్వ' },

    // Crop Rec — Seasons
    'season_kharif': { en: 'Kharif', hi: 'खरीफ', te: 'ఖరీఫ్' },
    'season_kharif_desc': { en: 'Jun–Oct (Summer)', hi: 'जून–अक्टू (ग्रीष्म)', te: 'జూన్–అక్టో (వేసవి)' },
    'season_rabi': { en: 'Rabi', hi: 'रबी', te: 'రబీ' },
    'season_rabi_desc': { en: 'Oct–Mar (Winter)', hi: 'अक्टू–मार्च (शीत)', te: 'అక్టో–మార్చి (శీతాకాలం)' },
    'season_zaid': { en: 'Zaid', hi: 'जायद', te: 'జాయిద్' },
    'season_zaid_desc': { en: 'Feb–Jun (Summer)', hi: 'फर–जून (ग्रीष्म)', te: 'ఫిబ్ర–జూన్ (వేసవి)' },

    // Crop Rec — Water levels
    'water_low': { en: 'Low', hi: 'कम', te: 'తక్కువ' },
    'water_moderate': { en: 'Moderate', hi: 'मध्यम', te: 'మధ్యస్థం' },
    'water_high': { en: 'High', hi: 'अधिक', te: 'ఎక్కువ' },

    // Crop detail labels
    'sowing_window': { en: 'Sowing Window', hi: 'बुवाई का समय', te: 'విత్తడం సమయం' },
    'harvest': { en: 'Harvest', hi: 'फसल कटाई', te: 'పంట కోత' },
    'growing_period': { en: 'Growing Period', hi: 'उगने की अवधि', te: 'పెరుగుదల కాలం' },
    'water_requirement': { en: 'Water Requirement', hi: 'पानी की आवश्यकता', te: 'నీటి అవసరం' },
    'expected_yield': { en: 'Expected Yield', hi: 'अपेक्षित उपज', te: 'ఆశించిన దిగుబడి' },
    'fertilizer': { en: 'Fertilizer', hi: 'उर्वरक', te: 'ఎరువు' },
    'best_districts': { en: 'Best Districts', hi: 'सर्वश्रेष्ठ जिले', te: 'ఉత్తమ జిల్లాలు' },
    'close': { en: 'Close', hi: 'बंद करें', te: 'మూసివేయండి' },
    'match': { en: 'match', hi: 'मैच', te: 'సరిపోలిక' },
    'no_crops_found': { en: 'No crops found for this combination. Try different filters.', hi: 'इस संयोजन के लिए कोई फसल नहीं मिली। अलग फिल्टर आज़माएं।', te: 'ఈ కలయికకు పంటలు దొరకలేదు. వేరే ఫిల్టర్‌లు ప్రయత్నించండి.' },
    'acres': { en: 'acres', hi: 'एकड़', te: 'ఎకరాలు' },
    'ap_districts': { en: 'Andhra Pradesh Districts', hi: 'आंध्र प्रदेश जिले', te: 'ఆంధ్ర ప్రదేశ్ జిల్లాలు' },
    'water_label': { en: 'water', hi: 'पानी', te: 'నీరు' },
    'recommended_varieties': { en: 'Recommended Varieties', hi: 'अनुशंसित किस्में', te: 'సిఫార్సు చేసిన రకాలు' },
    'intercropping': { en: 'Intercropping', hi: 'अंतरफसल', te: 'అంతర పంట' },
    'more': { en: 'more', hi: 'और', te: 'మరిన్ని' },

    // Stores
    'find_stores': { en: 'Find agricultural stores near you', hi: 'अपने पास कृषि दुकानें खोजें', te: 'మీ సమీపంలో వ్యవసాయ దుకాణాలు కనుగొనండి' },
    'search_stores': { en: 'Search stores...', hi: 'दुकानें खोजें...', te: 'దుకాణాలు వెతకండి...' },
    'navigate': { en: 'Navigate', hi: 'नेविगेट करें', te: 'నావిగేట్ చేయండి' },
    'show_map': { en: 'Show Map', hi: 'नक्शा दिखाएं', te: 'మ్యాప్ చూపించు' },
    'hide_map': { en: 'Hide Map', hi: 'नक्शा छुपाएं', te: 'మ్యాప్ దాచు' },
    'open': { en: 'Open', hi: 'खुला', te: 'తెరిచి ఉంది' },
    'closed': { en: 'Closed', hi: 'बंद', te: 'మూసి ఉంది' },
    'no_stores_found': { en: 'No stores found nearby. Try increasing the search radius.', hi: 'पास में कोई दुकान नहीं मिली। खोज त्रिज्या बढ़ाने का प्रयास करें।', te: 'సమీపంలో దుకాణాలు కనుగొనబడలేదు. శోధన పరిధిని పెంచడానికి ప్రయత్నించండి.' },
    'no_stores_subtitle': { en: 'Try a different search term or check back later', hi: 'कोई अन्य खोज शब्द आज़माएं या बाद में वापस जांचें', te: 'వేరే శోధన పదం ప్రయత్నించండి లేదా తర్వాత తనిఖీ చేయండి' },
    'loading_stores': { en: 'Finding stores near you...', hi: 'आपके पास दुकानें खोज रहे हैं...', te: 'మీ సమీపంలో దుకాణాలు వెతుకుతోంది...' },
    'stores_fetch_error': { en: 'Could not load stores. Please try again.', hi: 'दुकानें लोड नहीं हो सकीं। कृपया पुनः प्रयास करें।', te: 'దుకాణాలు లోడ్ కాలేదు. దయచేసి మళ్ళీ ప్రయత్నించండి.' },
    'map_area_note': { en: 'Your area. Use Navigate buttons below for directions.', hi: 'आपका क्षेत्र। दिशाओं के लिए नीचे नेविगेट बटन उपयोग करें।', te: 'మీ ప్రాంతం. దిశల కోసం క్రింద నావిగేట్ బటన్ వాడండి.' },
    'grant_location': { en: 'Grant location access to find stores', hi: 'दुकानें खोजने के लिए स्थान अनुमति दें', te: 'దుకాణాలు కనుగొనడానికి లొకేషన్ అనుమతి ఇవ్వండి' },

    // Voice Assistant
    'voice_assistant': { en: 'Voice Assistant', hi: 'वॉइस असिस्टेंट', te: 'వాయిస్ అసిస్టెంట్' },
    'ask_anything': { en: 'Ask me anything about farming', hi: 'खेती के बारे में कुछ भी पूछें', te: 'వ్యవసాయం గురించి ఏదైనా అడగండి' },
    'tap_to_speak': { en: 'Tap to speak', hi: 'बोलने के लिए टैप करें', te: 'మాట్లాడటానికి నొక్కండి' },
    'listening': { en: 'Listening… tap to stop', hi: 'सुन रहे हैं… रोकने के लिए टैप करें', te: 'వింటోంది… ఆపడానికి నొక్కండి' },
    'type_message': { en: 'Type your message...', hi: 'अपना संदेश लिखें...', te: 'మీ సందేశం టైప్ చేయండి...' },
    'listen': { en: 'Listen', hi: 'सुनें', te: 'వినండి' },

    // Auth
    'back_to_login': { en: 'Back to Login', hi: 'लॉगिन पर वापस जाएं', te: 'లాగిన్‌కు తిరిగి' },
    'welcome_smartagricare': { en: 'Welcome to SmartAgriCare', hi: 'स्मार्ट एग्रीकेयर में आपका स्वागत है', te: 'SmartAgriCare కి స్వాగతం' },
    'join_farmers': { en: 'Join 10,000+ farmers using SmartAgriCare', hi: '10,000+ किसान स्मार्ट एग्रीकेयर उपयोग कर रहे हैं', te: '10,000+ రైతులు SmartAgriCare ఉపయోగిస్తున్నారు' },
    'login': { en: 'Login', hi: 'लॉगिन', te: 'లాగిన్' },
    'sign_up': { en: 'Sign Up', hi: 'साइन अप', te: 'సైన్ అప్' },
    'forgot_password': { en: 'Forgot Password?', hi: 'पासवर्ड भूल गए?', te: 'పాస్‌వర్డ్ మర్చిపోయారా?' },
    'dont_have_account': { en: "Don't have an account?", hi: 'अकाउंट नहीं है?', te: 'ఖాతా లేదా?' },
    'already_registered': { en: 'Already registered?', hi: 'पहले से पंजीकृत?', te: 'ఇప్పటికే నమోదు చేసుకున్నారా?' },
    'create_account': { en: 'Create Account', hi: 'अकाउंट बनाएं', te: 'ఖాతా సృష్టించండి' },
    'reset_password': { en: 'Reset Password', hi: 'पासवर्ड रीसेट करें', te: 'పాస్‌వర్డ్ రీసెట్ చేయండి' },
    'enter_email': { en: 'Enter your registered email', hi: 'अपना पंजीकृत ईमेल दर्ज करें', te: 'మీ నమోదిత ఇమెయిల్ నమోదు చేయండి' },
    'send_otp': { en: 'Send Reset Code', hi: 'रीसेट कोड भेजें', te: 'రీసెట్ కోడ్ పంపండి' },
    'enter_otp': { en: 'Enter the 6-digit code sent to your email', hi: '6 अंकों का कोड दर्ज करें जो आपके ईमेल पर भेजा गया है', te: 'మీ ఇమెయిల్‌కు పంపిన 6-అంకెల కోడ్‌ని నమోదు చేయండి' },
    'new_password': { en: 'New Password', hi: 'नया पासवर्ड', te: 'కొత్త పాస్‌వర్డ్' },
    'password_reset_success': { en: 'Password reset successful! You can now login.', hi: 'पासवर्ड रीसेट सफल! अब आप लॉगिन कर सकते हैं।', te: 'పాస్‌వర్డ్ రీసెట్ విజయవంతం! ఇప్పుడు మీరు లాగిన్ చేయవచ్చు.' },

    // Navigation (BottomNav)
    'nav_home': { en: 'Home', hi: 'होम', te: 'హోమ్' },
    'nav_crop_rec': { en: 'Crop Rec.', hi: 'फसल सिफ़ा.', te: 'పంట సిఫా.' },
    'nav_scan': { en: 'Scan', hi: 'स्कैन', te: 'స్కాన్' },
    'nav_profile': { en: 'Profile', hi: 'प्रोफ़ाइल', te: 'ప్రొఫైల్' },
    'nav_find_stores': { en: 'Find Stores', hi: 'दुकानें खोजें', te: 'దుకాణాలు' },
    'nav_voice': { en: 'Voice Assistant', hi: 'वॉइस असिस्टेंट', te: 'వాయిస్ అసిస్టెంట్' },

    // Profile
    'farmer': { en: 'Farmer', hi: 'किसान', te: 'రైతు' },
    'profile': { en: 'Profile', hi: 'प्रोफ़ाइल', te: 'ప్రొఫైల్' },
    'account_details': { en: 'Account Details', hi: 'खाता विवरण', te: 'ఖాతా వివరాలు' },
    'edit': { en: 'Edit', hi: 'संपादित करें', te: 'సవరించండి' },
    'cancel': { en: 'Cancel', hi: 'रद्द करें', te: 'రద్దు చేయండి' },
    'save': { en: 'Save', hi: 'सहेजें', te: 'సేవ్ చేయండి' },
    'saving': { en: 'Saving...', hi: 'सहेज रहे हैं...', te: 'సేవ్ చేస్తోంది...' },
    'logout': { en: 'Logout', hi: 'लॉग आउट', te: 'లాగ్ అవుట్' },
    'name': { en: 'Name', hi: 'नाम', te: 'పేరు' },
    'email': { en: 'Email', hi: 'ईमेल', te: 'ఇమెయిల్' },
    'phone': { en: 'Phone', hi: 'फ़ोन', te: 'ఫోన్' },
    'location': { en: 'Location', hi: 'स्थान', te: 'స్థానం' },
};

export function t(key: string, lang: Language = 'en', vars?: Record<string, string>): string {
    const entry = translations[key];
    if (!entry) return key;
    let text = entry[lang] || entry.en;
    if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
            text = text.replaceAll(`{${k}}`, v);
        });
    }
    return text;
}

export type { Language };
