// Generated from docs/demo/Assistant_SOP_Example_Template.xlsx; do not edit manually.
export const BUILTIN_DEMO = {
  "schemaVersion": "3.0.0",
  "mode": "replace",
  "rulesetId": "ai-demo",
  "rulesetVersion": "1.0.0",
  "versions": {
    "global": "1.0.0",
    "exceptions": "1.0.0",
    "catalogs": "1.0.0",
    "platforms": {
      "pchome": "1.0.0",
      "momo": "1.0.0",
      "shopee": "1.0.0",
      "pxmart": "1.0.0",
      "rakuten": "1.0.0",
      "iopenmall": "1.0.0",
      "yahoo": "1.0.0",
      "wanjiafu": "1.0.0",
      "coupang": "1.0.0",
      "apple": "1.0.0",
      "samsung": "1.0.0"
    },
    "productTypes": {
      "special": "1.0.0"
    }
  },
  "sources": [
    {
      "id": "ai-demo",
      "documentVersion": "demo-1.0.0",
      "title": "AI 生成示範 SOP",
      "documentPath": "AI-SOP.md",
      "nature": "originalFictionalDemo"
    }
  ],
  "productTypes": [
    {
      "id": "special",
      "name": "特殊品類"
    }
  ],
  "facts": [
    {
      "id": "comparison",
      "name": "比較單位",
      "values": [
        "single",
        "whole"
      ]
    }
  ],
  "platforms": [
    {
      "id": "pchome",
      "name": "PChome",
      "enabled": true,
      "order": 0,
      "strategy": "single",
      "subflows": [],
      "sites": [
        {
          "host": "24h.pchome.com.tw"
        }
      ]
    },
    {
      "id": "momo",
      "name": "MOMO",
      "enabled": true,
      "order": 1,
      "strategy": "showAll",
      "subflows": [
        {
          "id": "general",
          "name": "一般 MOMO"
        },
        {
          "id": "moPlus",
          "name": "MO+"
        }
      ],
      "sites": [
        {
          "host": "www.momoshop.com.tw"
        }
      ]
    },
    {
      "id": "shopee",
      "name": "Shopee",
      "enabled": true,
      "order": 2,
      "strategy": "single",
      "subflows": [],
      "sites": [
        {
          "host": "shopee.tw"
        }
      ]
    },
    {
      "id": "pxmart",
      "name": "PXMart",
      "enabled": true,
      "order": 3,
      "strategy": "single",
      "subflows": [],
      "sites": [
        {
          "host": "pxbox.es.pxmart.com.tw"
        }
      ]
    },
    {
      "id": "rakuten",
      "name": "Rakuten",
      "enabled": true,
      "order": 4,
      "strategy": "single",
      "subflows": [],
      "sites": [
        {
          "host": "www.rakuten.com.tw"
        }
      ]
    },
    {
      "id": "iopenmall",
      "name": "iOPENMALL",
      "enabled": true,
      "order": 5,
      "strategy": "single",
      "subflows": [],
      "sites": [
        {
          "host": "mall.iopenmall.tw"
        }
      ]
    },
    {
      "id": "yahoo",
      "name": "Yahoo",
      "enabled": true,
      "order": 6,
      "strategy": "showAll",
      "subflows": [
        {
          "id": "selfOperated",
          "name": "自營"
        },
        {
          "id": "thirdParty",
          "name": "第三方"
        }
      ],
      "sites": [
        {
          "host": "tw.buy.yahoo.com"
        }
      ]
    },
    {
      "id": "wanjiafu",
      "name": "萬家福",
      "enabled": true,
      "order": 7,
      "strategy": "single",
      "subflows": [],
      "sites": [
        {
          "host": "online.uni-prosperity.com.tw"
        }
      ]
    },
    {
      "id": "coupang",
      "name": "Coupang（酷澎）",
      "enabled": true,
      "order": 8,
      "strategy": "single",
      "subflows": [],
      "sites": [
        {
          "host": "www.tw.coupang.com"
        }
      ]
    },
    {
      "id": "apple",
      "name": "Apple",
      "enabled": true,
      "order": 9,
      "strategy": "single",
      "subflows": [],
      "sites": [
        {
          "host": "www.apple.com",
          "path": "/tw"
        }
      ]
    },
    {
      "id": "samsung",
      "name": "Samsung",
      "enabled": true,
      "order": 10,
      "strategy": "single",
      "subflows": [],
      "sites": [
        {
          "host": "www.samsung.com",
          "path": "/tw"
        }
      ]
    }
  ],
  "rules": [
    {
      "id": "g-1",
      "scope": {
        "kind": "global"
      },
      "title": "AI示範｜商品規格",
      "content": "AI 生成示範，非平台官方政策。確認型號、尺寸及規格，資訊不足時保留未知。",
      "category": "productMatch",
      "priority": "high",
      "placements": [
        {
          "section": "sop",
          "order": 0
        },
        {
          "section": "checklist",
          "order": 0
        }
      ],
      "appliesTo": {
        "platformIds": null,
        "subflowRefs": null,
        "productTypeIds": null,
        "whenAll": []
      },
      "sourceRefs": [
        {
          "sourceId": "ai-demo",
          "documentVersion": "demo-1.0.0",
          "policyId": "g-1",
          "locator": "AI 示例"
        }
      ]
    },
    {
      "id": "g-2",
      "scope": {
        "kind": "global"
      },
      "title": "AI示範｜賣場來源",
      "content": "AI 生成示範，非平台官方政策。確認賣家、來源與商品頁資訊，必要時向賣家查證。",
      "category": "sellerEligibility",
      "priority": "high",
      "placements": [
        {
          "section": "sop",
          "order": 1
        },
        {
          "section": "checklist",
          "order": 1
        }
      ],
      "appliesTo": {
        "platformIds": null,
        "subflowRefs": null,
        "productTypeIds": null,
        "whenAll": []
      },
      "sourceRefs": [
        {
          "sourceId": "ai-demo",
          "documentVersion": "demo-1.0.0",
          "policyId": "g-2",
          "locator": "AI 示例"
        }
      ]
    },
    {
      "id": "g-3",
      "scope": {
        "kind": "global"
      },
      "title": "AI示範｜數量與包裝",
      "content": "AI 生成示範，非平台官方政策。核對單位、數量、組合及包裝是否相同。",
      "category": "quantity",
      "priority": "medium",
      "placements": [
        {
          "section": "sop",
          "order": 2
        },
        {
          "section": "checklist",
          "order": 2
        }
      ],
      "appliesTo": {
        "platformIds": null,
        "subflowRefs": null,
        "productTypeIds": null,
        "whenAll": []
      },
      "sourceRefs": [
        {
          "sourceId": "ai-demo",
          "documentVersion": "demo-1.0.0",
          "policyId": "g-3",
          "locator": "AI 示例"
        }
      ]
    },
    {
      "id": "g-4",
      "scope": {
        "kind": "global"
      },
      "title": "AI示範｜優惠券",
      "content": "AI 生成示範，非平台官方政策。請依當前商品頁確認優惠券資格與適用條件。",
      "category": "promotion",
      "priority": "medium",
      "placements": [
        {
          "section": "sop",
          "order": 3
        },
        {
          "section": "checklist",
          "order": 3
        }
      ],
      "appliesTo": {
        "platformIds": null,
        "subflowRefs": null,
        "productTypeIds": null,
        "whenAll": []
      },
      "sourceRefs": [
        {
          "sourceId": "ai-demo",
          "documentVersion": "demo-1.0.0",
          "policyId": "g-4",
          "locator": "AI 示例"
        }
      ]
    },
    {
      "id": "g-5",
      "scope": {
        "kind": "global"
      },
      "title": "AI示範｜點數與實付",
      "content": "AI 生成示範，非平台官方政策。確認回饋時點及實際結帳金額，不將未確認回饋視為折扣。",
      "category": "price",
      "priority": "high",
      "placements": [
        {
          "section": "sop",
          "order": 4
        },
        {
          "section": "checklist",
          "order": 4
        }
      ],
      "appliesTo": {
        "platformIds": null,
        "subflowRefs": null,
        "productTypeIds": null,
        "whenAll": []
      },
      "sourceRefs": [
        {
          "sourceId": "ai-demo",
          "documentVersion": "demo-1.0.0",
          "policyId": "g-5",
          "locator": "AI 示例"
        }
      ]
    },
    {
      "id": "g-6",
      "scope": {
        "kind": "global"
      },
      "title": "AI示範｜配送與運費",
      "content": "AI 生成示範，非平台官方政策。依當前商品頁確認配送地區、方式與運費。",
      "category": "shipping",
      "priority": "medium",
      "placements": [
        {
          "section": "sop",
          "order": 5
        },
        {
          "section": "checklist",
          "order": 5
        }
      ],
      "appliesTo": {
        "platformIds": null,
        "subflowRefs": null,
        "productTypeIds": null,
        "whenAll": []
      },
      "sourceRefs": [
        {
          "sourceId": "ai-demo",
          "documentVersion": "demo-1.0.0",
          "policyId": "g-6",
          "locator": "AI 示例"
        }
      ]
    },
    {
      "id": "g-7",
      "scope": {
        "kind": "global"
      },
      "title": "AI示範｜特殊品類",
      "content": "AI 生成示範，非平台官方政策。確認保固、效期或相容性是否適用商品。",
      "category": "categorySpecific",
      "priority": "low",
      "placements": [
        {
          "section": "sop",
          "order": 6
        },
        {
          "section": "checklist",
          "order": 6
        }
      ],
      "appliesTo": {
        "platformIds": null,
        "subflowRefs": null,
        "productTypeIds": null,
        "whenAll": []
      },
      "sourceRefs": [
        {
          "sourceId": "ai-demo",
          "documentVersion": "demo-1.0.0",
          "policyId": "g-7",
          "locator": "AI 示例"
        }
      ]
    },
    {
      "id": "p-pchome",
      "scope": {
        "kind": "platform",
        "platformId": "pchome"
      },
      "title": "AI示範｜PChome檢查清單",
      "content": "AI 生成示範，非平台官方政策。請依當前商品頁核對賣家、規格、優惠與配送資訊。",
      "category": "platformWorkflow",
      "priority": "medium",
      "placements": [
        {
          "section": "sop",
          "order": 7
        },
        {
          "section": "checklist",
          "order": 7
        }
      ],
      "appliesTo": {
        "platformIds": [
          "pchome"
        ],
        "subflowRefs": null,
        "productTypeIds": null,
        "whenAll": []
      },
      "sourceRefs": [
        {
          "sourceId": "ai-demo",
          "documentVersion": "demo-1.0.0",
          "policyId": "p-pchome",
          "locator": "AI 示例"
        }
      ]
    },
    {
      "id": "p-momo",
      "scope": {
        "kind": "platform",
        "platformId": "momo"
      },
      "title": "AI示範｜MOMO檢查清單",
      "content": "AI 生成示範，非平台官方政策。請依當前商品頁核對賣家、規格、優惠與配送資訊。",
      "category": "platformWorkflow",
      "priority": "medium",
      "placements": [
        {
          "section": "sop",
          "order": 8
        },
        {
          "section": "checklist",
          "order": 8
        }
      ],
      "appliesTo": {
        "platformIds": [
          "momo"
        ],
        "subflowRefs": null,
        "productTypeIds": null,
        "whenAll": []
      },
      "sourceRefs": [
        {
          "sourceId": "ai-demo",
          "documentVersion": "demo-1.0.0",
          "policyId": "p-momo",
          "locator": "AI 示例"
        }
      ]
    },
    {
      "id": "p-shopee",
      "scope": {
        "kind": "platform",
        "platformId": "shopee"
      },
      "title": "AI示範｜Shopee檢查清單",
      "content": "AI 生成示範，非平台官方政策。請依當前商品頁核對賣家、規格、優惠與配送資訊。",
      "category": "platformWorkflow",
      "priority": "medium",
      "placements": [
        {
          "section": "sop",
          "order": 9
        },
        {
          "section": "checklist",
          "order": 9
        }
      ],
      "appliesTo": {
        "platformIds": [
          "shopee"
        ],
        "subflowRefs": null,
        "productTypeIds": null,
        "whenAll": []
      },
      "sourceRefs": [
        {
          "sourceId": "ai-demo",
          "documentVersion": "demo-1.0.0",
          "policyId": "p-shopee",
          "locator": "AI 示例"
        }
      ]
    },
    {
      "id": "p-pxmart",
      "scope": {
        "kind": "platform",
        "platformId": "pxmart"
      },
      "title": "AI示範｜PXMart檢查清單",
      "content": "AI 生成示範，非平台官方政策。請依當前商品頁核對賣家、規格、優惠與配送資訊。",
      "category": "platformWorkflow",
      "priority": "medium",
      "placements": [
        {
          "section": "sop",
          "order": 10
        },
        {
          "section": "checklist",
          "order": 10
        }
      ],
      "appliesTo": {
        "platformIds": [
          "pxmart"
        ],
        "subflowRefs": null,
        "productTypeIds": null,
        "whenAll": []
      },
      "sourceRefs": [
        {
          "sourceId": "ai-demo",
          "documentVersion": "demo-1.0.0",
          "policyId": "p-pxmart",
          "locator": "AI 示例"
        }
      ]
    },
    {
      "id": "p-rakuten",
      "scope": {
        "kind": "platform",
        "platformId": "rakuten"
      },
      "title": "AI示範｜Rakuten檢查清單",
      "content": "AI 生成示範，非平台官方政策。請依當前商品頁核對賣家、規格、優惠與配送資訊。",
      "category": "platformWorkflow",
      "priority": "medium",
      "placements": [
        {
          "section": "sop",
          "order": 11
        },
        {
          "section": "checklist",
          "order": 11
        }
      ],
      "appliesTo": {
        "platformIds": [
          "rakuten"
        ],
        "subflowRefs": null,
        "productTypeIds": null,
        "whenAll": []
      },
      "sourceRefs": [
        {
          "sourceId": "ai-demo",
          "documentVersion": "demo-1.0.0",
          "policyId": "p-rakuten",
          "locator": "AI 示例"
        }
      ]
    },
    {
      "id": "p-iopenmall",
      "scope": {
        "kind": "platform",
        "platformId": "iopenmall"
      },
      "title": "AI示範｜iOPENMALL檢查清單",
      "content": "AI 生成示範，非平台官方政策。請依當前商品頁核對賣家、規格、優惠與配送資訊。",
      "category": "platformWorkflow",
      "priority": "medium",
      "placements": [
        {
          "section": "sop",
          "order": 12
        },
        {
          "section": "checklist",
          "order": 12
        }
      ],
      "appliesTo": {
        "platformIds": [
          "iopenmall"
        ],
        "subflowRefs": null,
        "productTypeIds": null,
        "whenAll": []
      },
      "sourceRefs": [
        {
          "sourceId": "ai-demo",
          "documentVersion": "demo-1.0.0",
          "policyId": "p-iopenmall",
          "locator": "AI 示例"
        }
      ]
    },
    {
      "id": "p-yahoo",
      "scope": {
        "kind": "platform",
        "platformId": "yahoo"
      },
      "title": "AI示範｜Yahoo檢查清單",
      "content": "AI 生成示範，非平台官方政策。請依當前商品頁核對賣家、規格、優惠與配送資訊。",
      "category": "platformWorkflow",
      "priority": "medium",
      "placements": [
        {
          "section": "sop",
          "order": 13
        },
        {
          "section": "checklist",
          "order": 13
        }
      ],
      "appliesTo": {
        "platformIds": [
          "yahoo"
        ],
        "subflowRefs": null,
        "productTypeIds": null,
        "whenAll": []
      },
      "sourceRefs": [
        {
          "sourceId": "ai-demo",
          "documentVersion": "demo-1.0.0",
          "policyId": "p-yahoo",
          "locator": "AI 示例"
        }
      ]
    },
    {
      "id": "p-wanjiafu",
      "scope": {
        "kind": "platform",
        "platformId": "wanjiafu"
      },
      "title": "AI示範｜萬家福檢查清單",
      "content": "AI 生成示範，非平台官方政策。請依當前商品頁核對賣家、規格、優惠與配送資訊。",
      "category": "platformWorkflow",
      "priority": "medium",
      "placements": [
        {
          "section": "sop",
          "order": 14
        },
        {
          "section": "checklist",
          "order": 14
        }
      ],
      "appliesTo": {
        "platformIds": [
          "wanjiafu"
        ],
        "subflowRefs": null,
        "productTypeIds": null,
        "whenAll": []
      },
      "sourceRefs": [
        {
          "sourceId": "ai-demo",
          "documentVersion": "demo-1.0.0",
          "policyId": "p-wanjiafu",
          "locator": "AI 示例"
        }
      ]
    },
    {
      "id": "p-coupang",
      "scope": {
        "kind": "platform",
        "platformId": "coupang"
      },
      "title": "AI示範｜Coupang（酷澎）檢查清單",
      "content": "AI 生成示範，非平台官方政策。請依當前商品頁核對賣家、規格、優惠與配送資訊。",
      "category": "platformWorkflow",
      "priority": "medium",
      "placements": [
        {
          "section": "sop",
          "order": 15
        },
        {
          "section": "checklist",
          "order": 15
        }
      ],
      "appliesTo": {
        "platformIds": [
          "coupang"
        ],
        "subflowRefs": null,
        "productTypeIds": null,
        "whenAll": []
      },
      "sourceRefs": [
        {
          "sourceId": "ai-demo",
          "documentVersion": "demo-1.0.0",
          "policyId": "p-coupang",
          "locator": "AI 示例"
        }
      ]
    },
    {
      "id": "p-apple",
      "scope": {
        "kind": "platform",
        "platformId": "apple"
      },
      "title": "AI示範｜Apple檢查清單",
      "content": "AI 生成示範，非平台官方政策。請依當前商品頁核對賣家、規格、優惠與配送資訊。",
      "category": "platformWorkflow",
      "priority": "medium",
      "placements": [
        {
          "section": "sop",
          "order": 16
        },
        {
          "section": "checklist",
          "order": 16
        }
      ],
      "appliesTo": {
        "platformIds": [
          "apple"
        ],
        "subflowRefs": null,
        "productTypeIds": null,
        "whenAll": []
      },
      "sourceRefs": [
        {
          "sourceId": "ai-demo",
          "documentVersion": "demo-1.0.0",
          "policyId": "p-apple",
          "locator": "AI 示例"
        }
      ]
    },
    {
      "id": "p-samsung",
      "scope": {
        "kind": "platform",
        "platformId": "samsung"
      },
      "title": "AI示範｜Samsung檢查清單",
      "content": "AI 生成示範，非平台官方政策。請依當前商品頁核對賣家、規格、優惠與配送資訊。",
      "category": "platformWorkflow",
      "priority": "medium",
      "placements": [
        {
          "section": "sop",
          "order": 17
        },
        {
          "section": "checklist",
          "order": 17
        }
      ],
      "appliesTo": {
        "platformIds": [
          "samsung"
        ],
        "subflowRefs": null,
        "productTypeIds": null,
        "whenAll": []
      },
      "sourceRefs": [
        {
          "sourceId": "ai-demo",
          "documentVersion": "demo-1.0.0",
          "policyId": "p-samsung",
          "locator": "AI 示例"
        }
      ]
    }
  ],
  "exceptions": [
    {
      "id": "ex-unit",
      "target": {
        "kind": "global",
        "ruleId": "g-3"
      },
      "action": "notApplicable",
      "appliesTo": {
        "platformIds": null,
        "subflowRefs": null,
        "productTypeIds": null,
        "whenAll": [
          {
            "factId": "comparison",
            "equals": "whole"
          }
        ]
      },
      "reason": "示範例外，不代表平台政策",
      "sourceRefs": [
        {
          "sourceId": "ai-demo",
          "documentVersion": "demo-1.0.0",
          "policyId": "ex-unit",
          "locator": "AI 示例"
        }
      ]
    }
  ]
};
