import { fetchLocalCommits } from "./app/actions";

async function main() {
    const cwd = process.cwd();
    console.log("Testing on:", cwd);

    // 1. Test Limit
    console.log("\n--- Test Limit 5 ---");
    try {
        const commits5 = await fetchLocalCommits(cwd, 5);
        console.log("Count:", commits5.length);
        if (commits5.length > 0) {
             console.log("Sample:", commits5[0].date, commits5[0].message);
        }
    } catch (e) {
        console.error("Limit test failed:", e);
    }

    // 2. Test Date Range
    // Let's assume there are commits recently.
    // If not, we might not get any.
    const today = new Date();
    const last30 = new Date();
    last30.setDate(today.getDate() - 30);
    const start = last30.toISOString().split('T')[0];
    const end = today.toISOString().split('T')[0];
    
    console.log(`\n--- Test Date Range ${start} to ${end} ---`);
    try {
        const commitsRange = await fetchLocalCommits(cwd, 100, start, end);
        console.log("Count:", commitsRange.length);
        if (commitsRange.length > 0) {
            console.log("Newest:", commitsRange[0].date);
            console.log("Oldest:", commitsRange[commitsRange.length-1].date);
        }
    } catch (e) {
        console.error("Date test failed:", e);
    }
}

main().catch(console.error);
