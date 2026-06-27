import time
import sqlite3
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By

def run_scraper():
    print("Starting Nahdi Scraper...")
    try:
        conn = sqlite3.connect("database.db")
        cur = conn.cursor()
        
        # Ensure tables exist
        cur.execute("""
        CREATE TABLE IF NOT EXISTS medications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            active_ingredient TEXT,
            stock_quantity INTEGER DEFAULT 0,
            price REAL DEFAULT 0.0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )""")
        
        options = uc.ChromeOptions()
        # Headless mode is usually detected by Cloudflare, but we can try False
        options.headless = False 
        driver = uc.Chrome(options=options)
        
        base_url = "https://www.nahdionline.com/ar-sa/plp/nahdi-global?page="
        
        print("Driver started. Bypassing WAF...")
        driver.get("https://www.nahdionline.com/ar-sa/plp/nahdi-global")
        time.sleep(10)
        
        total_inserted = 0
        
        for page in range(1, 201):
            print(f"Scraping page {page} of 200...")
            driver.get(f"{base_url}{page}")
            time.sleep(6) # Wait for Next.js to render
            
            # Scroll to trigger lazy loading
            for _ in range(5):
                driver.execute_script("window.scrollBy(0, 1000);")
                time.sleep(1)
                
            products = driver.find_elements(By.CSS_SELECTOR, ".product-item-info")
            found = 0
            
            for p in products:
                try:
                    name_el = p.find_element(By.CSS_SELECTOR, ".product-item-link")
                    name = name_el.text.strip()
                    
                    price_str = p.find_element(By.CSS_SELECTOR, ".price").text.replace("ر.س", "").strip()
                    price = float(price_str) if price_str else 0.0
                    cost = round(price * 0.7, 2)
                    stock = 50
                    category = "عام"
                    active = "غير محدد"
                    
                    if name and price >= 0:
                        # Check exist
                        cur.execute("SELECT id FROM medications WHERE name = ?", (name,))
                        if not cur.fetchone():
                            cur.execute("INSERT INTO medications (name, active_ingredient, stock_quantity, price) VALUES (?, ?, ?, ?)", (name, active, stock, price))
                        
                        cur.execute("SELECT id FROM pharmacy_drug_catalog WHERE drug_name = ?", (name,))
                        if not cur.fetchone():
                            cur.execute("INSERT INTO pharmacy_drug_catalog (drug_name, active_ingredient, category, selling_price, cost_price, stock_qty) VALUES (?, ?, ?, ?, ?, ?)", (name, active, category, price, cost, stock))
                            found += 1
                            total_inserted += 1
                except Exception as e:
                    pass
            
            conn.commit()
            print(f"Page {page} done! Inserted {found} new drugs. Total inserted so far: {total_inserted}")
            
    except Exception as e:
        print(f"Error occurred: {e}")
    finally:
        try:
            driver.quit()
        except:
            pass
        try:
            conn.close()
        except:
            pass

if __name__ == "__main__":
    run_scraper()
