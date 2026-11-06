export function defaultNecessityForCategory(category, discretionaryCategories = [
    "Cafe & Eating out",
    "Snacks & Sweets",
    "Alcohol",
    "Tobacco"
]) {
    if (discretionaryCategories.includes(category))
        return "discretionary";
    if (["Groceries", "Household", "Drugstore & Personal care"].includes(category))
        return "essential";
    return "neutral";
}
const keywordCategories = [
    {
        category: "Cafe & Eating out",
        necessity: "discretionary",
        keywords: ["kaffee", "latte", "cappuccino", "espresso", "cafe", "café", "croissant", "imbiss"]
    },
    {
        category: "Tobacco",
        necessity: "discretionary",
        keywords: ["zigarett", "tabak", "marlboro", "camel", "lucky strike", "pall mall"]
    },
    {
        category: "Beverages",
        necessity: "neutral",
        keywords: ["red bull", "energy drink", "wasser", "mineralwasser", "saft", "cola", "limo"]
    },
    {
        category: "Snacks & Sweets",
        necessity: "discretionary",
        keywords: ["chips", "schokolade", "gummibärchen", "gummibaerchen", "keks", "riegel", "bonbon"]
    },
    {
        category: "Alcohol",
        necessity: "discretionary",
        keywords: ["bier", "wein", "sekt", "prosecco", "vodka", "whisky", "gin"]
    },
    {
        category: "Deposit/Pfand",
        necessity: "neutral",
        keywords: ["pfand", "deposit", "leergut"]
    },
    {
        category: "Drugstore & Personal care",
        necessity: "essential",
        keywords: ["zahnpasta", "shampoo", "duschgel", "seife", "deo", "windeln"]
    },
    {
        category: "Household",
        necessity: "essential",
        keywords: ["waschmittel", "spuelmittel", "spülmittel", "reiniger", "papierhandtuch", "toilettenpapier"]
    },
    {
        category: "Groceries",
        necessity: "essential",
        keywords: ["milch", "brot", "eier", "kaese", "käse", "apfel", "banane", "nudel", "reis", "tomate"]
    }
];
export function normalizeGermanName(name) {
    return name
        .replace(/[äÄ]/g, "ae")
        .replace(/[öÖ]/g, "oe")
        .replace(/[üÜ]/g, "ue")
        .replace(/ß/g, "ss")
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLocaleLowerCase("de-DE")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}
export function classifyLineItem(name, discretionaryCategories = [
    "Cafe & Eating out",
    "Snacks & Sweets",
    "Alcohol",
    "Tobacco"
]) {
    const normalized = normalizeGermanName(name);
    const match = keywordCategories.find(({ keywords }) => keywords.some((keyword) => normalized.includes(normalizeGermanName(keyword))));
    if (!match)
        return {
            category: "Groceries",
            necessity: defaultNecessityForCategory("Groceries", discretionaryCategories)
        };
    return {
        category: match.category,
        necessity: defaultNecessityForCategory(match.category, discretionaryCategories)
    };
}
