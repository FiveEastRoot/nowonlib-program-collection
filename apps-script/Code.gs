var API_NAME = "nowonlib-program-collection";
var SCHEMA_VERSION = "0.1.0";
var LOCK_TIMEOUT_MS = 30000;
var MAX_GENERATED_FILE_BYTES = 5 * 1024 * 1024;
var SNAPSHOT_CACHE_KEY = "snapshot:v1:" + SCHEMA_VERSION;
var SNAPSHOT_CACHE_SECONDS = 300;
var SNAPSHOT_CACHE_MAX_CHARS = 80000;
var SLOW_SNAPSHOT_MS = 2500;
var GENERATED_ROOT_FOLDER_NAME = "노원구립도서관_문화프로그램_통합수합";
var GENERATED_FILES_FOLDER_NAME = "생성파일";

var SHEET_HEADERS = {
  LIBRARIES: [
    "library_id", "official_name", "display_name", "abbreviation",
    "output_order", "active", "submitter_account_ref",
    "drive_photo_folder_id", "notes", "created_at", "updated_at"
  ],
  COLLECTIONS: [
    "collection_id", "collection_type", "target_month", "title",
    "deadline_at", "status", "submission_open_at", "photo_drive_folder_id",
    "template_day10_file_id", "template_day20_city_file_id",
    "template_day20_foundation_file_id", "created_at", "updated_at"
  ],
  SUBMISSIONS: [
    "submission_id", "collection_id", "library_id", "status", "version",
    "saved_at", "submitted_at", "locked_at", "reviewed_at",
    "revision_requested_at", "review_note", "program_count",
    "last_request_id", "created_at", "updated_at"
  ],
  PROGRAMS: [
    "program_id", "submission_id", "library_id", "title_original",
    "title_output_city", "title_output_foundation", "program_type",
    "schedule_type", "schedule_original", "start_date", "start_time",
    "end_date", "end_time", "recurrence_text", "location", "audience",
    "capacity", "description_original", "description_output_city",
    "description_output_foundation", "manager_name", "registration_text",
    "budget_text", "promotion_plan", "include_day10", "include_city",
    "include_foundation", "output_order_day10", "output_order_city",
    "output_order_foundation", "duplicate_group_id", "duplicate_status",
    "validation_status", "validation_messages", "admin_note",
    "created_at", "updated_at"
  ],
  REVISION_REQUESTS: [
    "revision_id", "submission_id", "requested_by", "requested_at",
    "status", "message", "due_at", "resolved_at", "resolution_note"
  ],
  AUDIT_LOG: [
    "audit_id", "request_id", "actor_role", "actor_ref", "action",
    "entity_type", "entity_id", "changed_fields", "detail", "created_at"
  ],
  GENERATED_FILES: [
    "file_id", "collection_id", "document_type", "version", "status",
    "source_revision", "template_file_id", "drive_file_id", "file_name",
    "generated_at", "generated_by", "request_id", "checksum",
    "error_code", "error_message", "reviewed_at", "notes"
  ],
  SETTINGS: [
    "setting_key", "setting_value", "value_type", "storage_scope",
    "description", "updated_at"
  ]
};

var PROGRAM_INPUT_FIELDS = [
  "program_id", "title_original", "title_output_city",
  "title_output_foundation", "program_type", "schedule_type",
  "schedule_original", "start_date", "start_time", "end_date", "end_time",
  "recurrence_text", "location", "audience", "capacity",
  "description_original", "description_output_city",
  "description_output_foundation", "manager_name", "registration_text",
  "budget_text", "promotion_plan", "include_day10", "include_city",
  "include_foundation", "output_order_day10", "output_order_city",
  "output_order_foundation", "admin_note"
];

var REQUIRED_PROGRAM_FIELDS = [
  "program_type", "title_original", "schedule_original", "location",
  "audience", "capacity", "manager_name", "description_original"
];

function doGet() {
  return jsonOutput_({
    ok: true,
    data: {
      service: API_NAME,
      schema_version: SCHEMA_VERSION,
      status: "ok"
    },
    meta: { server_time: nowIso_() }
  });
}

/**
 * Apps Script 배포 소유자가 Drive 범위를 최초 1회 승인할 때 실행합니다.
 * 파일이나 폴더는 만들지 않고 현재 계정의 Drive 루트 ID만 반환합니다.
 */
function authorizeDriveAccess() {
  return DriveApp.getRootFolder().getId();
}

function doPost(e) {
  try {
    var request = parseRequest_(e);
    var result = dispatchRequest_(request, createServices_());
    return jsonOutput_({
      ok: true,
      data: result.data,
      meta: result.meta
    });
  } catch (error) {
    return jsonOutput_(errorResponse_(error));
  }
}

function dispatchRequest_(request, services) {
  requireObject_(request, "INVALID_REQUEST", "JSON 요청 본문이 필요합니다.");
  verifyServiceSecret_(request.service_secret, services.properties);
  validateRequestId_(request.request_id);
  validateActor_(request.actor);

  var action = requiredText_(request.action, "INVALID_ACTION", "action이 필요합니다.");
  if (action === "get_snapshot") {
    return getCachedSnapshot_(request, services);
  }

  var lock = services.lockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
    throw apiError_("LOCK_TIMEOUT", "다른 저장 작업이 진행 중입니다. 잠시 후 다시 시도해주세요.");
  }

  try {
    var spreadsheet = openSpreadsheet_(services);
    validateSchema_(spreadsheet);

    if (action === "get_generated_file") {
      return {
        data: getGeneratedFile_(spreadsheet, request, services),
        meta: responseMeta_(request.request_id, false)
      };
    }

    var duplicate = findRecord_(
      readTable_(spreadsheet, "AUDIT_LOG"),
      "request_id",
      request.request_id
    );
    if (duplicate) {
      return {
        data: {
          duplicate: true,
          request_id: request.request_id,
          audit_id: duplicate.audit_id,
          entity_id: duplicate.entity_id
        },
        meta: responseMeta_(request.request_id, true)
      };
    }

    var data;
    if (action === "save_submission") {
      data = saveSubmission_(spreadsheet, request, services);
    } else if (action === "submit_submission") {
      data = submitSubmission_(spreadsheet, request, services);
    } else if (action === "append_program") {
      data = appendProgram_(spreadsheet, request, services);
    } else if (action === "delete_program") {
      data = deleteProgram_(spreadsheet, request, services);
    } else if (action === "request_revision") {
      data = requestRevision_(spreadsheet, request, services);
    } else if (action === "complete_review") {
      data = completeReview_(spreadsheet, request, services);
    } else if (action === "create_collection_month") {
      data = createCollectionMonth_(spreadsheet, request, services);
    } else if (action === "set_collection_status") {
      data = setCollectionStatus_(spreadsheet, request, services);
    } else if (action === "store_generated_file") {
      data = storeGeneratedFile_(spreadsheet, request, services);
    } else {
      throw apiError_(
        "UNSUPPORTED_ACTION",
        "지원하지 않는 작업입니다: " + action
      );
    }
    invalidateSnapshotCache_(services);

    return {
      data: data,
      meta: responseMeta_(request.request_id, false)
    };
  } finally {
    lock.releaseLock();
  }
}

function getCachedSnapshot_(request, services) {
  var startedAt = Date.now();
  var cached = services.cache
    ? services.cache.get(SNAPSHOT_CACHE_KEY)
    : null;
  var fullSnapshot;
  var cacheHit = false;
  if (cached) {
    try {
      fullSnapshot = JSON.parse(cached);
      cacheHit = true;
    } catch (error) {
      if (services.cache) {
        services.cache.remove(SNAPSHOT_CACHE_KEY);
      }
    }
  }
  if (!fullSnapshot) {
    var spreadsheet = openSpreadsheet_(services);
    validateSchema_(spreadsheet);
    fullSnapshot = getSnapshot_(spreadsheet);
    var serialized = JSON.stringify(fullSnapshot);
    if (
      services.cache &&
      serialized.length <= SNAPSHOT_CACHE_MAX_CHARS
    ) {
      services.cache.put(
        SNAPSHOT_CACHE_KEY,
        serialized,
        SNAPSHOT_CACHE_SECONDS
      );
    }
  }
  var durationMs = Date.now() - startedAt;
  if (durationMs >= SLOW_SNAPSHOT_MS && services.logger) {
    services.logger.warn(JSON.stringify({
      event: "slow_snapshot",
      request_id: request.request_id,
      duration_ms: durationMs,
      cache_hit: cacheHit
    }));
  }
  var meta = responseMeta_(request.request_id, false);
  meta.cache_hit = cacheHit;
  meta.duration_ms = durationMs;
  return {
    data: filterSnapshotForActor_(normalizeSnapshot_(fullSnapshot), request.actor),
    meta: meta
  };
}

function invalidateSnapshotCache_(services) {
  if (services.cache) {
    services.cache.remove(SNAPSHOT_CACHE_KEY);
  }
}

function getGeneratedFile_(spreadsheet, request, services) {
  if (request.actor.role !== "admin") {
    throw apiError_("FORBIDDEN", "관리자만 생성 파일을 내려받을 수 있습니다.");
  }
  var payload = request.payload || {};
  var fileId = requiredText_(
    payload.file_id,
    "INVALID_FILE_ID",
    "file_id가 필요합니다."
  );
  if (!/^file_[A-Za-z0-9._:-]{1,120}$/.test(fileId)) {
    throw apiError_("INVALID_FILE_ID", "file_id 형식이 올바르지 않습니다.");
  }
  var generatedFile = requiredRecord_(
    readTable_(spreadsheet, "GENERATED_FILES"),
    "file_id",
    fileId,
    "GENERATED_FILE_NOT_FOUND",
    "생성 파일 기록을 찾을 수 없습니다."
  );
  if (textValue_(generatedFile.status) !== "generated") {
    throw apiError_("GENERATED_FILE_UNAVAILABLE", "다운로드할 수 없는 생성 파일입니다.");
  }
  var driveFile;
  try {
    driveFile = services.driveApp.getFileById(
      requiredText_(
        generatedFile.drive_file_id,
        "DRIVE_FILE_NOT_FOUND",
        "Drive 파일 ID가 없습니다."
      )
    );
  } catch (error) {
    throw apiError_("DRIVE_FILE_NOT_FOUND", "Drive에서 생성 파일을 찾을 수 없습니다.");
  }
  var bytes = driveFile.getBlob().getBytes();
  if (
    !bytes.length ||
    bytes.length > MAX_GENERATED_FILE_BYTES ||
    bytes[0] !== 80 ||
    bytes[1] !== 75
  ) {
    throw apiError_("INVALID_STORED_FILE", "보관된 HWPX 파일이 올바르지 않습니다.");
  }
  var actualChecksum = "sha256:" + sha256Hex_(bytes, services.utilities);
  if (actualChecksum !== textValue_(generatedFile.checksum).toLowerCase()) {
    throw apiError_("CHECKSUM_MISMATCH", "보관된 파일의 체크섬이 기록과 일치하지 않습니다.");
  }
  return {
    file_id: fileId,
    file_name: validateGeneratedFileName_(generatedFile.file_name),
    file_base64: services.utilities.base64Encode(bytes),
    checksum: actualChecksum,
    version: numberValue_(generatedFile.version),
    document_type: textValue_(generatedFile.document_type)
  };
}

function getSnapshot_(spreadsheet) {
  var libraries = readTable_(spreadsheet, "LIBRARIES").rows.map(function (row) {
    return rowToRecord_(SHEET_HEADERS.LIBRARIES, row);
  });
  var collections = readTable_(spreadsheet, "COLLECTIONS").rows.map(function (row) {
    return rowToRecord_(SHEET_HEADERS.COLLECTIONS, row);
  });
  var submissions = readTable_(spreadsheet, "SUBMISSIONS").rows
    .map(function (row) {
      return rowToRecord_(SHEET_HEADERS.SUBMISSIONS, row);
    });
  var programs = readTable_(spreadsheet, "PROGRAMS").rows.map(function (row) {
    return rowToRecord_(SHEET_HEADERS.PROGRAMS, row);
  });
  var audit = readTable_(spreadsheet, "AUDIT_LOG").rows
    .map(function (row) {
      return rowToRecord_(SHEET_HEADERS.AUDIT_LOG, row);
    });
  var generatedFiles = readTable_(spreadsheet, "GENERATED_FILES").rows.map(function (row) {
    return rowToRecord_(SHEET_HEADERS.GENERATED_FILES, row);
  });

  return normalizeSnapshot_({
    schema_version: SCHEMA_VERSION,
    libraries: libraries,
    collections: collections,
    submissions: submissions,
    programs: programs,
    audit: audit,
    generated_files: generatedFiles
  });
}

function filterSnapshotForActor_(snapshot, actor) {
  if (actor.role === "admin") {
    return snapshot;
  }
  var submissions = snapshot.submissions.filter(function (submission) {
    return submission.library_id === actor.library_id;
  });
  var submissionIds = {};
  submissions.forEach(function (submission) {
    submissionIds[submission.submission_id] = true;
  });
  return {
    schema_version: snapshot.schema_version,
    libraries: snapshot.libraries,
    collections: snapshot.collections,
    submissions: submissions,
    programs: snapshot.programs.filter(function (program) {
      return Boolean(submissionIds[program.submission_id]);
    }),
    audit: snapshot.audit.filter(function (entry) {
      return entry.entity_type === "submission" &&
        Boolean(submissionIds[entry.entity_id]);
    }),
    generated_files: []
  };
}

function storeGeneratedFile_(spreadsheet, request, services) {
  if (request.actor.role !== "admin") {
    throw apiError_("FORBIDDEN", "관리자만 생성 파일을 보관할 수 있습니다.");
  }
  var payload = request.payload || {};
  var collectionId = requiredText_(
    payload.collection_id,
    "INVALID_COLLECTION_ID",
    "collection_id가 필요합니다."
  );
  var collections = readTable_(spreadsheet, "COLLECTIONS");
  var collection = requiredRecord_(
    collections,
    "collection_id",
    collectionId,
    "COLLECTION_NOT_FOUND",
    "수합 회차를 찾을 수 없습니다."
  );
  var documentType = validateGeneratedDocumentType_(
    payload.document_type,
    collection.collection_type
  );
  var fileName = validateGeneratedFileName_(payload.file_name);
  var fileBase64 = requiredText_(
    payload.file_base64,
    "INVALID_FILE_CONTENT",
    "HWPX 파일 내용이 필요합니다."
  );
  if (
    fileBase64.length > Math.ceil(MAX_GENERATED_FILE_BYTES * 4 / 3) + 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(fileBase64)
  ) {
    throw apiError_("INVALID_FILE_CONTENT", "HWPX 파일 내용이 올바르지 않습니다.");
  }
  var bytes;
  try {
    bytes = services.utilities.base64Decode(fileBase64);
  } catch (error) {
    throw apiError_("INVALID_FILE_CONTENT", "HWPX 파일 내용을 해석할 수 없습니다.");
  }
  if (
    !bytes.length ||
    bytes.length > MAX_GENERATED_FILE_BYTES ||
    bytes[0] !== 80 ||
    bytes[1] !== 75
  ) {
    throw apiError_("INVALID_FILE_CONTENT", "유효한 HWPX ZIP 파일이 아닙니다.");
  }
  var expectedChecksum = requiredText_(
    payload.checksum,
    "INVALID_CHECKSUM",
    "checksum이 필요합니다."
  ).toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/.test(expectedChecksum)) {
    throw apiError_("INVALID_CHECKSUM", "checksum 형식이 올바르지 않습니다.");
  }
  var actualChecksum = "sha256:" + sha256Hex_(bytes, services.utilities);
  if (actualChecksum !== expectedChecksum) {
    throw apiError_("CHECKSUM_MISMATCH", "생성 파일 체크섬이 일치하지 않습니다.");
  }
  var sourceRevision = requiredText_(
    payload.source_revision,
    "INVALID_SOURCE_REVISION",
    "source_revision이 필요합니다."
  );
  if (!/^sha256:[a-f0-9]{64}$/.test(sourceRevision)) {
    throw apiError_("INVALID_SOURCE_REVISION", "source_revision 형식이 올바르지 않습니다.");
  }

  var generatedTable = readTable_(spreadsheet, "GENERATED_FILES");
  var nextVersion = recordsFor_(
    generatedTable,
    "collection_id",
    collectionId
  ).filter(function (record) {
    return record.document_type === documentType;
  }).reduce(function (maximum, record) {
    return Math.max(maximum, numberValue_(record.version));
  }, 0) + 1;
  var fileId = "file_" + services.utilities.getUuid();
  var generatedAt = services.now();
  var folder = resolveGeneratedMonthFolder_(
    spreadsheet,
    services,
    normalizeTargetMonth_(collection.target_month)
  );
  var blob = services.utilities.newBlob(
    bytes,
    "application/hwp+zip",
    fileName
  );
  var driveFile;
  var generatedSheet = spreadsheet.getSheetByName("GENERATED_FILES");
  var generatedRowNumber = generatedSheet.getLastRow() + 1;
  try {
    driveFile = folder.createFile(blob);
    var record = {
      file_id: fileId,
      collection_id: collectionId,
      document_type: documentType,
      version: nextVersion,
      status: "generated",
      source_revision: sourceRevision,
      template_file_id: templateFileIdFor_(collection, documentType),
      drive_file_id: driveFile.getId(),
      file_name: fileName,
      generated_at: generatedAt,
      generated_by: request.actor.actor_ref,
      request_id: request.request_id,
      checksum: actualChecksum,
      error_code: "",
      error_message: "",
      reviewed_at: "",
      notes: textValue_(payload.notes)
    };
    generatedSheet.appendRow(recordToRow_(SHEET_HEADERS.GENERATED_FILES, record));
    appendAudit_(spreadsheet, request, services, {
      action: "store_generated_file",
      entity_type: "generated_file",
      entity_id: fileId,
      changed_fields: "status,drive_file_id,checksum",
      detail: "document_type=" + documentType + "; version=" + nextVersion
    });
    return {
      file_id: fileId,
      drive_file_id: driveFile.getId(),
      file_name: fileName,
      status: "generated",
      version: nextVersion,
      checksum: actualChecksum
    };
  } catch (error) {
    if (generatedSheet.getLastRow() >= generatedRowNumber) {
      generatedSheet.deleteRow(generatedRowNumber);
    }
    if (driveFile) {
      driveFile.setTrashed(true);
    }
    throw error;
  }
}

function validateGeneratedDocumentType_(value, collectionType) {
  var documentType = requiredText_(
    value,
    "INVALID_DOCUMENT_TYPE",
    "document_type이 필요합니다."
  );
  var allowed = collectionType === "monthly"
    ? ["day10_city", "day20_city", "day20_foundation"]
    : collectionType === "day10"
      ? ["day10_city"]
      : ["day20_city", "day20_foundation"];
  if (allowed.indexOf(documentType) < 0) {
    throw apiError_("DOCUMENT_TYPE_MISMATCH", "수합 회차와 문서 종류가 일치하지 않습니다.");
  }
  return documentType;
}

function validateGeneratedFileName_(value) {
  var fileName = requiredText_(
    value,
    "INVALID_FILE_NAME",
    "file_name이 필요합니다."
  );
  if (
    fileName.length > 180 ||
    !/\.hwpx$/i.test(fileName) ||
    /[\\/:*?"<>|]/.test(fileName)
  ) {
    throw apiError_("INVALID_FILE_NAME", "HWPX 파일명이 올바르지 않습니다.");
  }
  return fileName;
}

function resolveGeneratedMonthFolder_(spreadsheet, services, targetMonth) {
  var settings = readTable_(spreadsheet, "SETTINGS");
  var rootSetting = requiredRecord_(
    settings,
    "setting_key",
    "drive_root_folder_id",
    "DRIVE_ROOT_SETTING_MISSING",
    "drive_root_folder_id 설정이 없습니다."
  );
  var rootFolder;
  var rootFolderId = textValue_(rootSetting.setting_value);
  if (rootFolderId) {
    try {
      rootFolder = services.driveApp.getFolderById(rootFolderId);
    } catch (error) {
      throw apiError_("DRIVE_FOLDER_NOT_FOUND", "설정된 Drive 상위 폴더를 찾을 수 없습니다.");
    }
  } else {
    rootFolder = services.driveApp.createFolder(GENERATED_ROOT_FOLDER_NAME);
    updateRecord_(settings, "setting_key", "drive_root_folder_id", {
      setting_value: rootFolder.getId(),
      updated_at: services.now()
    });
    writeTable_(settings);
  }
  var generatedFolder = getOrCreateChildFolder_(
    rootFolder,
    GENERATED_FILES_FOLDER_NAME
  );
  return getOrCreateChildFolder_(
    generatedFolder,
    targetMonth || "미지정"
  );
}

function getOrCreateChildFolder_(parent, name) {
  var folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function templateFileIdFor_(collection, documentType) {
  if (documentType === "day10_city") {
    return textValue_(collection.template_day10_file_id);
  }
  if (documentType === "day20_city") {
    return textValue_(collection.template_day20_city_file_id);
  }
  return textValue_(collection.template_day20_foundation_file_id);
}

function sha256Hex_(bytes, utilities) {
  return utilities.computeDigest(
    utilities.DigestAlgorithm.SHA_256,
    bytes
  ).map(function (value) {
    var normalized = value < 0 ? value + 256 : value;
    return ("0" + normalized.toString(16)).slice(-2);
  }).join("");
}

function createCollectionMonth_(spreadsheet, request, services) {
  if (request.actor.role !== "admin") {
    throw apiError_("FORBIDDEN", "관리자만 새 대상 월을 준비할 수 있습니다.");
  }
  var targetMonth = requiredText_(
    (request.payload || {}).target_month,
    "INVALID_TARGET_MONTH",
    "target_month가 필요합니다."
  );
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) {
    throw apiError_(
      "INVALID_TARGET_MONTH",
      "target_month는 YYYY-MM 형식이어야 합니다."
    );
  }

  var collections = readTable_(spreadsheet, "COLLECTIONS");
  if (collections.rows.some(function (row) {
    return normalizeTargetMonth_(
      rowToRecord_(collections.headers, row).target_month
    ) === targetMonth;
  })) {
    throw apiError_(
      "MONTH_ALREADY_EXISTS",
      "이미 준비된 대상 월입니다."
    );
  }
  var submissions = readTable_(spreadsheet, "SUBMISSIONS");
  var libraries = readTable_(spreadsheet, "LIBRARIES")
    .rows.map(function (row) {
      return rowToRecord_(SHEET_HEADERS.LIBRARIES, row);
    })
    .filter(function (library) {
      return (
        library.active !== false &&
        String(library.active).toUpperCase() !== "FALSE"
      );
    });
  var now = services.now();
  var rollback = snapshotTables_([collections, submissions]);
  var createdIds = [];
  var priorCollections = collections.rows
    .map(function (row) {
      return rowToRecord_(collections.headers, row);
    })
    .sort(function (left, right) {
      return normalizeTargetMonth_(right.target_month).localeCompare(
        normalizeTargetMonth_(left.target_month)
      );
    });

  ["monthly"].forEach(function (type) {
    var collectionId = targetMonth + "-" + type;
    var day = "10";
    collections.rows.push(recordToRow_(collections.headers, {
      collection_id: collectionId,
      collection_type: type,
      target_month: targetMonth,
      title: "통합 수합 · 3종 문서 공통 입력",
      deadline_at: targetMonth + "-" + day + "T07:00:00.000Z",
      status: "planned",
      photo_drive_folder_id: "",
      template_day10_file_id: priorCollections.map(function (collection) {
        return collection.template_day10_file_id;
      }).filter(Boolean)[0] || "",
      template_day20_city_file_id: priorCollections.map(function (collection) {
        return collection.template_day20_city_file_id;
      }).filter(Boolean)[0] || "",
      template_day20_foundation_file_id:
        priorCollections.map(function (collection) {
          return collection.template_day20_foundation_file_id;
        }).filter(Boolean)[0] || "",
      created_at: now,
      updated_at: now
    }));
    libraries.forEach(function (library) {
      submissions.rows.push(recordToRow_(submissions.headers, {
        submission_id: collectionId + "-" + library.library_id,
        collection_id: collectionId,
        library_id: library.library_id,
        status: "draft",
        version: 1,
        program_count: 0,
        created_at: now,
        updated_at: now
      }));
    });
    createdIds.push(collectionId);
  });

  try {
    writeTable_(collections);
    writeTable_(submissions);
    appendAudit_(spreadsheet, request, services, {
      action: "create_collection_month",
      entity_type: "collection_month",
      entity_id: targetMonth,
      changed_fields: "collections,submissions",
      detail: JSON.stringify({
        collection_ids: createdIds,
        submission_count: libraries.length,
        status: "planned"
      })
    });
  } catch (error) {
    restoreTables_(rollback);
    throw error;
  }

  return {
    target_month: targetMonth,
    collection_ids: createdIds,
    submission_count: libraries.length,
    status: "planned"
  };
}

function setCollectionStatus_(spreadsheet, request, services) {
  if (request.actor.role !== "admin") {
    throw apiError_("FORBIDDEN", "관리자만 수합 상태를 변경할 수 있습니다.");
  }
  var payload = request.payload || {};
  var collectionId = requiredText_(
    payload.collection_id,
    "INVALID_COLLECTION_ID",
    "collection_id가 필요합니다."
  );
  var targetStatus = requiredText_(
    payload.status,
    "INVALID_COLLECTION_STATUS",
    "status가 필요합니다."
  );
  if (targetStatus !== "open" && targetStatus !== "closed") {
    throw apiError_(
      "INVALID_COLLECTION_STATUS",
      "수합 상태는 open 또는 closed만 지정할 수 있습니다."
    );
  }

  var collections = readTable_(spreadsheet, "COLLECTIONS");
  var collection = requiredRecord_(
    collections,
    "collection_id",
    collectionId,
    "COLLECTION_NOT_FOUND",
    "수합 회차를 찾을 수 없습니다."
  );
  var previousStatus = textValue_(collection.status);
  var allowed =
    (targetStatus === "closed" && previousStatus === "open") ||
    (targetStatus === "open" &&
      (previousStatus === "planned" || previousStatus === "closed"));
  if (!allowed) {
    throw apiError_(
      "INVALID_STATUS_TRANSITION",
      "현재 상태에서는 요청한 수합 상태로 변경할 수 없습니다."
    );
  }

  var now = services.now();
  var changes = {
    status: targetStatus,
    updated_at: now
  };
  if (targetStatus === "open" && !textValue_(collection.submission_open_at)) {
    changes.submission_open_at = now;
  }
  var rollback = snapshotTables_([collections]);
  updateRecord_(collections, "collection_id", collectionId, changes);
  try {
    writeTable_(collections);
    appendAudit_(spreadsheet, request, services, {
      action: "set_collection_status",
      entity_type: "collection",
      entity_id: collectionId,
      changed_fields: Object.keys(changes).join(","),
      detail: JSON.stringify({
        previous_status: previousStatus,
        status: targetStatus
      })
    });
  } catch (error) {
    restoreTables_(rollback);
    throw error;
  }

  return {
    collection_id: collectionId,
    previous_status: previousStatus,
    status: targetStatus,
    updated_at: now
  };
}

function saveSubmission_(spreadsheet, request, services) {
  var payload = request.payload || {};
  var submissionId = requiredText_(
    payload.submission_id,
    "INVALID_SUBMISSION_ID",
    "submission_id가 필요합니다."
  );
  var submissions = readTable_(spreadsheet, "SUBMISSIONS");
  var submission = requiredRecord_(
    submissions,
    "submission_id",
    submissionId,
    "SUBMISSION_NOT_FOUND",
    "제출자료를 찾을 수 없습니다."
  );

  assertSubmissionAccess_(request.actor, submission);
  assertVersion_(submission, payload.expected_version);
  var now = services.now();
  var completedSelfEdit =
    request.actor.role === "submitter" &&
    ["submitted", "resubmitted"].indexOf(submission.status) >= 0;
  if (request.actor.role === "submitter") {
    var saveCollections = readTable_(spreadsheet, "COLLECTIONS");
    var saveCollection = requiredRecord_(
      saveCollections,
      "collection_id",
      submission.collection_id,
      "COLLECTION_NOT_FOUND",
      "수합 회차를 찾을 수 없습니다."
    );
    assertCollectionOpen_(saveCollection);
    if (
      completedSelfEdit &&
      isAfterDeadline_(now, saveCollection.deadline_at)
    ) {
      throw apiError_(
        "SUBMISSION_EDIT_DEADLINE_PASSED",
        "제출 마감 후에는 관리자 수정 요청이 있어야 수정할 수 있습니다."
      );
    }
    if (
      submission.status !== "draft" &&
      submission.status !== "revision_requested" &&
      !completedSelfEdit
    ) {
      throw apiError_(
        "SUBMISSION_LOCKED",
        "현재 자료는 수정할 수 없습니다. 관리자에게 문의해주세요."
      );
    }
  }
  if (!Array.isArray(payload.programs)) {
    throw apiError_("INVALID_PROGRAMS", "programs 배열이 필요합니다.");
  }
  if (payload.programs.length > 100) {
    throw apiError_("TOO_MANY_PROGRAMS", "한 제출자료에는 프로그램을 100개까지 저장할 수 있습니다.");
  }

  var programs = readTable_(spreadsheet, "PROGRAMS");
  var existingPrograms = recordsFor_(
    programs,
    "submission_id",
    submissionId
  );
  var existingById = indexBy_(existingPrograms, "program_id");
  var seenProgramIds = {};
  var normalizedPrograms = payload.programs.map(function (input, index) {
    var normalized = normalizeProgram_(
      input,
      existingById,
      submission,
      request.actor,
      now,
      services,
      index
    );
    if (seenProgramIds[normalized.program_id]) {
      throw apiError_("DUPLICATE_PROGRAM_ID", "program_id가 중복되었습니다.");
    }
    seenProgramIds[normalized.program_id] = true;
    return normalized;
  });
  if (completedSelfEdit && normalizedPrograms.length) {
    validateProgramsForSubmission_(normalizedPrograms);
  }

  var rollback = snapshotTables_([submissions, programs]);
  var submissionChanges = {
    version: numberValue_(submission.version) + 1,
    saved_at: now,
    program_count: normalizedPrograms.length,
    last_request_id: request.request_id,
    updated_at: now
  };
  updateRecord_(submissions, "submission_id", submissionId, submissionChanges);
  replaceRecords_(
    programs,
    "submission_id",
    submissionId,
    normalizedPrograms
  );

  try {
    writeTable_(submissions);
    writeTable_(programs);
    appendAudit_(spreadsheet, request, services, {
      action: "save_submission",
      entity_type: "submission",
      entity_id: submissionId,
      changed_fields: "programs,version,saved_at,program_count",
      detail: JSON.stringify({
        program_count: normalizedPrograms.length,
        previous_status: submission.status,
        status: submission.status
      })
    });
  } catch (error) {
    restoreTables_(rollback);
    throw error;
  }

  return {
    submission_id: submissionId,
    status: submission.status,
    version: submissionChanges.version,
    saved_at: now,
    program_count: normalizedPrograms.length
  };
}

function appendProgram_(spreadsheet, request, services) {
  var payload = request.payload || {};
  var submissionId = requiredText_(
    payload.submission_id,
    "INVALID_SUBMISSION_ID",
    "submission_id가 필요합니다."
  );
  var submissions = readTable_(spreadsheet, "SUBMISSIONS");
  var submission = requiredRecord_(
    submissions,
    "submission_id",
    submissionId,
    "SUBMISSION_NOT_FOUND",
    "제출자료를 찾을 수 없습니다."
  );

  assertSubmissionAccess_(request.actor, submission);
  assertVersion_(submission, payload.expected_version);
  if (request.actor.role !== "submitter") {
    throw apiError_("FORBIDDEN", "제출자만 신규 프로그램을 추가할 수 있습니다.");
  }
  if (submission.status === "reviewed") {
    throw apiError_(
      "SUBMISSION_NOT_COMPLETED",
      "관리자에 의해 검토가 완료된 자료는 신규 프로그램을 별도 추가할 수 없습니다. 추가 필요시 담당자에게 문의하세요."
    );
  }
  if (["submitted", "resubmitted"].indexOf(submission.status) < 0) {
    throw apiError_(
      "SUBMISSION_LOCKED",
      "제출 마감 후에는 관리자 수정 요청이 있어야 수정할 수 있습니다."
    );
  }

  var collections = readTable_(spreadsheet, "COLLECTIONS");
  var collection = requiredRecord_(
    collections,
    "collection_id",
    submission.collection_id,
    "COLLECTION_NOT_FOUND",
    "수합 회차를 찾을 수 없습니다."
  );
  assertCollectionOpen_(collection);
  var now = services.now();
  if (isAfterDeadline_(now, collection.deadline_at)) {
    throw apiError_(
      "SUBMISSION_EDIT_DEADLINE_PASSED",
      "제출 마감 후에는 관리자 수정 요청이 있어야 수정할 수 있습니다."
    );
  }

  var programs = readTable_(spreadsheet, "PROGRAMS");
  var existingPrograms = recordsFor_(programs, "submission_id", submissionId);
  var requestedId = textValue_((payload.program || {}).program_id);
  if (requestedId && findRecord_(programs, "program_id", requestedId)) {
    throw apiError_(
      "PROGRAM_ALREADY_EXISTS",
      "기존 프로그램은 변경할 수 없습니다. 새 프로그램으로 다시 추가해주세요."
    );
  }

  var normalized = normalizeProgram_(
    payload.program,
    {},
    submission,
    request.actor,
    now,
    services,
    existingPrograms.length
  );
  validateProgramsForSubmission_([normalized]);

  var nextStatus = submission.status;
  var submissionChanges = {
    status: nextStatus,
    version: numberValue_(submission.version) + 1,
    saved_at: now,
    submitted_at: now,
    locked_at: now,
    reviewed_at: "",
    program_count: existingPrograms.length + 1,
    last_request_id: request.request_id,
    updated_at: now
  };
  var rollback = snapshotTables_([submissions, programs]);
  updateRecord_(submissions, "submission_id", submissionId, submissionChanges);
  programs.rows.push(recordToRow_(programs.headers, normalized));

  try {
    writeTable_(submissions);
    writeTable_(programs);
    appendAudit_(spreadsheet, request, services, {
      action: "append_program",
      entity_type: "submission",
      entity_id: submissionId,
      changed_fields: "programs,status,version,saved_at,submitted_at,locked_at,reviewed_at,program_count",
      detail: JSON.stringify({
        program_id: normalized.program_id,
        previous_status: submission.status,
        status: nextStatus
      })
    });
  } catch (error) {
    restoreTables_(rollback);
    throw error;
  }

  return {
    submission_id: submissionId,
    program_id: normalized.program_id,
    status: nextStatus,
    version: submissionChanges.version,
    submitted_at: now,
    program_count: submissionChanges.program_count,
    locked: true
  };
}

function deleteProgram_(spreadsheet, request, services) {
  var payload = request.payload || {};
  var submissionId = requiredText_(
    payload.submission_id,
    "INVALID_SUBMISSION_ID",
    "submission_id가 필요합니다."
  );
  var programId = requiredText_(
    payload.program_id,
    "INVALID_PROGRAM_ID",
    "program_id가 필요합니다."
  );
  if (request.actor.role !== "admin") {
    throw apiError_("FORBIDDEN", "관리자만 프로그램을 삭제할 수 있습니다.");
  }

  var submissions = readTable_(spreadsheet, "SUBMISSIONS");
  var submission = requiredRecord_(
    submissions,
    "submission_id",
    submissionId,
    "SUBMISSION_NOT_FOUND",
    "제출자료를 찾을 수 없습니다."
  );
  assertVersion_(submission, payload.expected_version);

  var programs = readTable_(spreadsheet, "PROGRAMS");
  var program = requiredRecord_(
    programs,
    "program_id",
    programId,
    "PROGRAM_NOT_FOUND",
    "프로그램을 찾을 수 없습니다."
  );
  if (String(program.submission_id) !== String(submissionId)) {
    throw apiError_("PROGRAM_NOT_FOUND", "해당 제출자료의 프로그램이 아닙니다.");
  }

  var now = services.now();
  var existingPrograms = recordsFor_(programs, "submission_id", submissionId);
  var submissionChanges = {
    version: numberValue_(submission.version) + 1,
    saved_at: now,
    program_count: Math.max(0, existingPrograms.length - 1),
    last_request_id: request.request_id,
    updated_at: now
  };
  var rollback = snapshotTables_([submissions, programs]);
  updateRecord_(submissions, "submission_id", submissionId, submissionChanges);
  var programIdIndex = programs.headers.indexOf("program_id");
  programs.rows = programs.rows.filter(function (row) {
    return String(row[programIdIndex]) !== String(programId);
  });

  try {
    writeTable_(submissions);
    writeTable_(programs);
    appendAudit_(spreadsheet, request, services, {
      action: "delete_program",
      entity_type: "submission",
      entity_id: submissionId,
      changed_fields: "programs,version,saved_at,program_count",
      detail: JSON.stringify({ program_id: programId })
    });
  } catch (error) {
    restoreTables_(rollback);
    throw error;
  }

  return {
    submission_id: submissionId,
    program_id: programId,
    status: submission.status,
    version: submissionChanges.version,
    saved_at: now,
    program_count: submissionChanges.program_count,
    deleted: true
  };
}

function submitSubmission_(spreadsheet, request, services) {
  var payload = request.payload || {};
  var submissionId = requiredText_(
    payload.submission_id,
    "INVALID_SUBMISSION_ID",
    "submission_id가 필요합니다."
  );
  var submissions = readTable_(spreadsheet, "SUBMISSIONS");
  var submission = requiredRecord_(
    submissions,
    "submission_id",
    submissionId,
    "SUBMISSION_NOT_FOUND",
    "제출자료를 찾을 수 없습니다."
  );

  assertSubmissionAccess_(request.actor, submission);
  assertVersion_(submission, payload.expected_version);
  if (submission.status !== "draft" && submission.status !== "revision_requested") {
    throw apiError_("SUBMISSION_LOCKED", "현재 상태에서는 제출할 수 없습니다.");
  }

  var programsTable = readTable_(spreadsheet, "PROGRAMS");
  var programs = recordsFor_(programsTable, "submission_id", submissionId);
  validateProgramsForSubmission_(programs);

  var collections = readTable_(spreadsheet, "COLLECTIONS");
  var collection = requiredRecord_(
    collections,
    "collection_id",
    submission.collection_id,
    "COLLECTION_NOT_FOUND",
    "수합 회차를 찾을 수 없습니다."
  );
  if (request.actor.role === "submitter") {
    assertCollectionOpen_(collection);
  }
  var revisions = readTable_(spreadsheet, "REVISION_REQUESTS");
  var rollback = snapshotTables_([submissions, revisions]);
  var now = services.now();
  var wasRevision = submission.status === "revision_requested";
  var nextStatus = wasRevision
    ? "resubmitted"
    : isAfterDeadline_(now, collection.deadline_at)
      ? "late"
      : "submitted";
  var submissionChanges = {
    status: nextStatus,
    version: numberValue_(submission.version) + 1,
    saved_at: now,
    submitted_at: now,
    locked_at: now,
    review_note: wasRevision ? "" : submission.review_note,
    last_request_id: request.request_id,
    updated_at: now
  };
  updateRecord_(submissions, "submission_id", submissionId, submissionChanges);

  if (wasRevision) {
    revisions.rows.forEach(function (row) {
      var item = rowToRecord_(revisions.headers, row);
      if (item.submission_id === submissionId && item.status === "open") {
        setRowValue_(revisions, row, "status", "resolved");
        setRowValue_(revisions, row, "resolved_at", now);
        setRowValue_(revisions, row, "resolution_note", "재제출 완료");
      }
    });
  }

  try {
    writeTable_(submissions);
    if (wasRevision) {
      writeTable_(revisions);
    }
    appendAudit_(spreadsheet, request, services, {
      action: wasRevision ? "resubmit_submission" : "submit_submission",
      entity_type: "submission",
      entity_id: submissionId,
      changed_fields: "status,version,submitted_at,locked_at",
      detail: JSON.stringify({ status: nextStatus, program_count: programs.length })
    });
  } catch (error) {
    restoreTables_(rollback);
    throw error;
  }

  return {
    submission_id: submissionId,
    status: nextStatus,
    version: submissionChanges.version,
    submitted_at: now,
    locked: true
  };
}

function assertCollectionOpen_(collection) {
  if (textValue_(collection.status) !== "open") {
    throw apiError_(
      "COLLECTION_NOT_OPEN",
      "현재 수합이 열려 있지 않아 저장하거나 제출할 수 없습니다."
    );
  }
}

function requestRevision_(spreadsheet, request, services) {
  if (request.actor.role !== "admin") {
    throw apiError_("FORBIDDEN", "관리자만 수정 요청을 등록할 수 있습니다.");
  }
  var payload = request.payload || {};
  var submissionId = requiredText_(
    payload.submission_id,
    "INVALID_SUBMISSION_ID",
    "submission_id가 필요합니다."
  );
  var message = requiredText_(
    payload.message,
    "INVALID_REVISION_MESSAGE",
    "수정 요청 내용을 입력해주세요."
  );
  var submissions = readTable_(spreadsheet, "SUBMISSIONS");
  var submission = requiredRecord_(
    submissions,
    "submission_id",
    submissionId,
    "SUBMISSION_NOT_FOUND",
    "제출자료를 찾을 수 없습니다."
  );
  assertVersion_(submission, payload.expected_version);
  if (
    submission.status !== "submitted" &&
    submission.status !== "late" &&
    submission.status !== "resubmitted" &&
    submission.status !== "reviewed"
  ) {
    throw apiError_("INVALID_STATUS_TRANSITION", "현재 상태에서는 수정 요청을 등록할 수 없습니다.");
  }

  var revisions = readTable_(spreadsheet, "REVISION_REQUESTS");
  var rollback = snapshotTables_([submissions, revisions]);
  var now = services.now();
  var revisionId = "rev_" + services.utilities.getUuid();
  var revision = {
    revision_id: revisionId,
    submission_id: submissionId,
    requested_by: request.actor.actor_ref,
    requested_at: now,
    status: "open",
    message: message,
    due_at: textValue_(payload.due_at),
    resolved_at: "",
    resolution_note: ""
  };
  revisions.rows.push(recordToRow_(revisions.headers, revision));
  var submissionChanges = {
    status: "revision_requested",
    version: numberValue_(submission.version) + 1,
    locked_at: "",
    revision_requested_at: now,
    review_note: message,
    last_request_id: request.request_id,
    updated_at: now
  };
  updateRecord_(submissions, "submission_id", submissionId, submissionChanges);

  try {
    writeTable_(submissions);
    writeTable_(revisions);
    appendAudit_(spreadsheet, request, services, {
      action: "request_revision",
      entity_type: "submission",
      entity_id: submissionId,
      changed_fields: "status,version,locked_at,revision_requested_at,review_note",
      detail: JSON.stringify({ revision_id: revisionId })
    });
  } catch (error) {
    restoreTables_(rollback);
    throw error;
  }

  return {
    submission_id: submissionId,
    revision_id: revisionId,
    status: "revision_requested",
    version: submissionChanges.version,
    locked: false
  };
}

function completeReview_(spreadsheet, request, services) {
  if (request.actor.role !== "admin") {
    throw apiError_("FORBIDDEN", "관리자만 검토 완료 처리할 수 있습니다.");
  }
  var payload = request.payload || {};
  var submissionId = requiredText_(
    payload.submission_id,
    "INVALID_SUBMISSION_ID",
    "submission_id가 필요합니다."
  );
  var submissions = readTable_(spreadsheet, "SUBMISSIONS");
  var submission = requiredRecord_(
    submissions,
    "submission_id",
    submissionId,
    "SUBMISSION_NOT_FOUND",
    "제출자료를 찾을 수 없습니다."
  );
  assertVersion_(submission, payload.expected_version);
  if (
    submission.status !== "submitted" &&
    submission.status !== "late" &&
    submission.status !== "resubmitted"
  ) {
    throw apiError_(
      "INVALID_STATUS_TRANSITION",
      "제출 완료 또는 재제출 자료만 검토 완료 처리할 수 있습니다."
    );
  }

  var rollback = snapshotTables_([submissions]);
  var now = services.now();
  var submissionChanges = {
    status: "reviewed",
    version: numberValue_(submission.version) + 1,
    reviewed_at: now,
    locked_at: submission.locked_at || now,
    last_request_id: request.request_id,
    updated_at: now
  };
  updateRecord_(submissions, "submission_id", submissionId, submissionChanges);

  try {
    writeTable_(submissions);
    appendAudit_(spreadsheet, request, services, {
      action: "complete_review",
      entity_type: "submission",
      entity_id: submissionId,
      changed_fields: "status,version,reviewed_at,locked_at",
      detail: JSON.stringify({ previous_status: submission.status })
    });
  } catch (error) {
    restoreTables_(rollback);
    throw error;
  }

  return {
    submission_id: submissionId,
    status: "reviewed",
    version: submissionChanges.version,
    reviewed_at: now,
    locked: true
  };
}

function normalizeProgram_(
  input,
  existingById,
  submission,
  actor,
  now,
  services,
  index
) {
  requireObject_(input, "INVALID_PROGRAM", "프로그램 항목은 객체여야 합니다.");
  var requestedId = textValue_(input.program_id);
  var programId = requestedId || "program_" + services.utilities.getUuid();
  var existing = existingById[programId] || {};
  var record = {};

  PROGRAM_INPUT_FIELDS.forEach(function (field) {
    if (field === "program_id") {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      record[field] = input[field];
    } else if (Object.prototype.hasOwnProperty.call(existing, field)) {
      record[field] = existing[field];
    } else {
      record[field] = "";
    }
  });
  if (!textValue_(record.schedule_original)) {
    record.schedule_original = defaultScheduleOriginal_(record);
  }

  if (actor.role !== "admin") {
    record.admin_note = existing.admin_note || "";
  }
  record.program_id = programId;
  record.submission_id = submission.submission_id;
  record.library_id = submission.library_id;
  record.created_at = existing.created_at || now;
  record.updated_at = now;

  var validationMessages = validateProgramRecord_(record, index);
  record.validation_status = validationMessages.length ? "error" : "valid";
  record.validation_messages = validationMessages.join(" | ");
  record.duplicate_group_id = existing.duplicate_group_id || "";
  record.duplicate_status = existing.duplicate_status || "";

  return record;
}

function defaultScheduleOriginal_(program) {
  var startDate = formatScheduleDate_(program.start_date);
  var endDate = formatScheduleDate_(program.end_date);
  var startTime = textValue_(program.start_time);
  var endTime = textValue_(program.end_time);
  if (startDate && startDate === endDate) {
    var time = startTime && endTime
      ? startTime + "~" + endTime
      : startTime || endTime;
    return [startDate, time].filter(function (value) {
      return Boolean(value);
    }).join(" ");
  }
  var start = [startDate, startTime].filter(function (value) {
    return Boolean(value);
  }).join(" ");
  var end = [endDate, endTime].filter(function (value) {
    return Boolean(value);
  }).join(" ");
  return start && end ? start + " ~ " + end : start || end;
}

function formatScheduleDate_(value) {
  var text = textValue_(value);
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) {
    return text;
  }
  var date = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  ));
  var weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return match[1] + ". " + Number(match[2]) + ". " + Number(match[3]) +
    ".(" + weekdays[date.getUTCDay()] + ")";
}

function validateProgramsForSubmission_(programs) {
  if (!programs.length) {
    throw apiError_("PROGRAM_REQUIRED", "프로그램을 한 건 이상 입력해야 합니다.");
  }
  var messages = [];
  programs.forEach(function (program, index) {
    validateProgramRecord_(program, index).forEach(function (message) {
      messages.push(message);
    });
  });
  if (messages.length) {
    throw apiError_(
      "PROGRAM_VALIDATION_FAILED",
      "필수값 또는 일정 오류를 확인해주세요: " + messages.slice(0, 5).join("; ")
    );
  }
}

function validateProgramRecord_(program, index) {
  var messages = [];
  REQUIRED_PROGRAM_FIELDS.forEach(function (field) {
    if (!textValue_(program[field])) {
      messages.push((index + 1) + "번 프로그램 " + field + " 누락");
    }
  });
  if (["행사", "강연", "전시"].indexOf(textValue_(program.program_type)) < 0) {
    messages.push((index + 1) + "번 프로그램 program_type 오류");
  }
  if (Number(program.capacity) <= 0) {
    messages.push((index + 1) + "번 프로그램 capacity 오류");
  }
  var startDate = textValue_(program.start_date);
  var endDate = textValue_(program.end_date);
  if (startDate && endDate && startDate > endDate) {
    messages.push((index + 1) + "번 프로그램 시작일이 종료일보다 늦음");
  }
  return messages;
}

function validateSchema_(spreadsheet) {
  Object.keys(SHEET_HEADERS).forEach(function (sheetName) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      throw apiError_("SCHEMA_MISMATCH", sheetName + " 시트가 없습니다.");
    }
    var expected = SHEET_HEADERS[sheetName];
    var actual = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
    for (var index = 0; index < expected.length; index += 1) {
      if (actual[index] !== expected[index]) {
        throw apiError_(
          "SCHEMA_MISMATCH",
          sheetName + "!" + columnLetter_(index + 1) + "1 헤더가 일치하지 않습니다."
        );
      }
    }
  });

  var settings = readTable_(spreadsheet, "SETTINGS");
  var schemaSetting = findRecord_(settings, "setting_key", "schema_version");
  if (!schemaSetting || String(schemaSetting.setting_value) !== SCHEMA_VERSION) {
    throw apiError_(
      "SCHEMA_VERSION_MISMATCH",
      "지원하는 스키마 버전은 " + SCHEMA_VERSION + "입니다."
    );
  }
}

function readTable_(spreadsheet, sheetName) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw apiError_("SCHEMA_MISMATCH", sheetName + " 시트가 없습니다.");
  }
  var values = sheet.getDataRange().getValues();
  var headers = SHEET_HEADERS[sheetName];
  var rows = values.length > 1
    ? values.slice(1).map(function (row) {
        return headers.map(function (_, index) {
          return typeof row[index] === "undefined" ? "" : row[index];
        });
      })
    : [];
  return { sheet: sheet, name: sheetName, headers: headers.slice(), rows: rows };
}

function writeTable_(table) {
  var width = table.headers.length;
  var lastRow = table.sheet.getLastRow();
  if (lastRow > 1) {
    table.sheet.getRange(2, 1, lastRow - 1, width).clearContent();
  }
  if (table.rows.length) {
    table.sheet.getRange(2, 1, table.rows.length, width).setValues(table.rows);
  }
}

function snapshotTables_(tables) {
  return tables.map(function (table) {
    return {
      table: table,
      rows: table.rows.map(function (row) { return row.slice(); })
    };
  });
}

function restoreTables_(snapshots) {
  snapshots.forEach(function (snapshot) {
    snapshot.table.rows = snapshot.rows.map(function (row) { return row.slice(); });
    writeTable_(snapshot.table);
  });
}

function findRecord_(table, field, value) {
  var fieldIndex = table.headers.indexOf(field);
  for (var index = 0; index < table.rows.length; index += 1) {
    if (String(table.rows[index][fieldIndex]) === String(value)) {
      return rowToRecord_(table.headers, table.rows[index]);
    }
  }
  return null;
}

function requiredRecord_(table, field, value, code, message) {
  var record = findRecord_(table, field, value);
  if (!record) {
    throw apiError_(code, message);
  }
  return record;
}

function recordsFor_(table, field, value) {
  var fieldIndex = table.headers.indexOf(field);
  return table.rows
    .filter(function (row) {
      return String(row[fieldIndex]) === String(value);
    })
    .map(function (row) {
      return rowToRecord_(table.headers, row);
    });
}

function replaceRecords_(table, field, value, records) {
  var fieldIndex = table.headers.indexOf(field);
  var keptRows = table.rows.filter(function (row) {
    return String(row[fieldIndex]) !== String(value);
  });
  table.rows = keptRows.concat(records.map(function (record) {
    return recordToRow_(table.headers, record);
  }));
}

function updateRecord_(table, keyField, keyValue, changes) {
  var keyIndex = table.headers.indexOf(keyField);
  for (var index = 0; index < table.rows.length; index += 1) {
    var row = table.rows[index];
    if (String(row[keyIndex]) === String(keyValue)) {
      Object.keys(changes).forEach(function (field) {
        setRowValue_(table, row, field, changes[field]);
      });
      return;
    }
  }
  throw apiError_("RECORD_NOT_FOUND", "수정할 레코드를 찾을 수 없습니다.");
}

function setRowValue_(table, row, field, value) {
  var fieldIndex = table.headers.indexOf(field);
  if (fieldIndex < 0) {
    throw apiError_("SCHEMA_MISMATCH", table.name + "." + field + " 열이 없습니다.");
  }
  row[fieldIndex] = typeof value === "undefined" || value === null ? "" : value;
}

function rowToRecord_(headers, row) {
  var record = {};
  headers.forEach(function (header, index) {
    record[header] = typeof row[index] === "undefined" ? "" : row[index];
  });
  return record;
}

function recordToRow_(headers, record) {
  return headers.map(function (header) {
    var value = record[header];
    return typeof value === "undefined" || value === null ? "" : value;
  });
}

function appendAudit_(spreadsheet, request, services, event) {
  var sheet = spreadsheet.getSheetByName("AUDIT_LOG");
  var auditId = "audit_" + services.utilities.getUuid();
  var record = {
    audit_id: auditId,
    request_id: request.request_id,
    actor_role: request.actor.role,
    actor_ref: request.actor.actor_ref,
    action: event.action,
    entity_type: event.entity_type,
    entity_id: event.entity_id,
    changed_fields: event.changed_fields,
    detail: event.detail,
    created_at: services.now()
  };
  sheet.appendRow(recordToRow_(SHEET_HEADERS.AUDIT_LOG, record));
  return auditId;
}

function indexBy_(records, field) {
  var result = {};
  records.forEach(function (record) {
    result[record[field]] = record;
  });
  return result;
}

function normalizeSnapshot_(snapshot) {
  snapshot.collections = uniqueRecords_(snapshot.collections, "collection_id")
    .map(function (collection) {
      collection.target_month = normalizeTargetMonth_(collection.target_month);
      return collection;
    });
  snapshot.submissions = uniqueRecords_(snapshot.submissions, "submission_id");
  snapshot.programs = uniqueRecords_(snapshot.programs, "program_id")
    .map(function (program) {
      program.start_date = normalizeSheetDate_(program.start_date);
      program.end_date = normalizeSheetDate_(program.end_date);
      program.start_time = normalizeSheetTime_(program.start_time);
      program.end_time = normalizeSheetTime_(program.end_time);
      return program;
    });
  return snapshot;
}

function uniqueRecords_(records, field) {
  var seen = Object.create(null);
  return records.filter(function (record) {
    var key = textValue_(record[field]);
    if (seen[key]) {
      return false;
    }
    seen[key] = true;
    return true;
  });
}

function normalizeTargetMonth_(value) {
  var text = textValue_(value);
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) {
    return text;
  }
  var date = new Date(value);
  if (isNaN(date.getTime())) {
    return text;
  }
  var korea = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return korea.getUTCFullYear() + "-" +
    String(korea.getUTCMonth() + 1).padStart(2, "0");
}

function normalizeSheetDate_(value) {
  var text = textValue_(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  var date = new Date(value);
  if (isNaN(date.getTime())) {
    return text;
  }
  var korea = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return korea.getUTCFullYear() + "-" +
    String(korea.getUTCMonth() + 1).padStart(2, "0") + "-" +
    String(korea.getUTCDate()).padStart(2, "0");
}

function normalizeSheetTime_(value) {
  var text = textValue_(value);
  var direct = /^(\d{2}):(\d{2})/.exec(text);
  if (direct) {
    return direct[1] + ":" + direct[2];
  }
  var date = new Date(value);
  if (isNaN(date.getTime())) {
    return text;
  }
  var korea = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return String(korea.getUTCHours()).padStart(2, "0") + ":" +
    String(korea.getUTCMinutes()).padStart(2, "0");
}

function assertSubmissionAccess_(actor, submission) {
  if (actor.role === "admin") {
    return;
  }
  if (actor.library_id !== submission.library_id) {
    throw apiError_("FORBIDDEN", "본인 도서관의 제출자료만 처리할 수 있습니다.");
  }
}

function assertVersion_(submission, expectedVersion) {
  if (!Number.isInteger(expectedVersion)) {
    throw apiError_("EXPECTED_VERSION_REQUIRED", "expected_version 정수가 필요합니다.");
  }
  var currentVersion = numberValue_(submission.version);
  if (currentVersion !== expectedVersion) {
    throw apiError_(
      "VERSION_CONFLICT",
      "다른 사용자가 먼저 저장했습니다. 최신 자료를 다시 불러와주세요."
    );
  }
}

function validateActor_(actor) {
  requireObject_(actor, "INVALID_ACTOR", "actor가 필요합니다.");
  if (actor.role !== "submitter" && actor.role !== "admin") {
    throw apiError_("INVALID_ROLE", "actor.role은 submitter 또는 admin이어야 합니다.");
  }
  requiredText_(actor.actor_ref, "INVALID_ACTOR_REF", "actor_ref가 필요합니다.");
  if (actor.role === "submitter") {
    requiredText_(actor.library_id, "INVALID_LIBRARY_ID", "제출자는 library_id가 필요합니다.");
  }
}

function validateRequestId_(requestId) {
  var value = requiredText_(
    requestId,
    "INVALID_REQUEST_ID",
    "request_id가 필요합니다."
  );
  if (
    value.length < 8 ||
    value.length > 128 ||
    !/^[A-Za-z0-9._:-]+$/.test(value)
  ) {
    throw apiError_("INVALID_REQUEST_ID", "request_id 형식이 올바르지 않습니다.");
  }
}

function verifyServiceSecret_(provided, properties) {
  var expected = properties.getProperty("SERVICE_SECRET");
  if (!expected) {
    throw apiError_("SERVER_NOT_CONFIGURED", "서비스 비밀값이 설정되지 않았습니다.");
  }
  if (!safeEquals_(String(provided || ""), String(expected))) {
    throw apiError_("UNAUTHORIZED", "서비스 인증에 실패했습니다.");
  }
}

function safeEquals_(left, right) {
  var mismatch = left.length ^ right.length;
  var length = Math.max(left.length, right.length);
  for (var index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index % Math.max(left.length, 1)) || 0) ^
      (right.charCodeAt(index % Math.max(right.length, 1)) || 0);
  }
  return mismatch === 0;
}

function openSpreadsheet_(services) {
  var spreadsheetId = services.properties.getProperty("SPREADSHEET_ID");
  if (!spreadsheetId) {
    throw apiError_("SERVER_NOT_CONFIGURED", "SPREADSHEET_ID가 설정되지 않았습니다.");
  }
  return services.spreadsheetApp.openById(spreadsheetId);
}

function createServices_() {
  return {
    properties: PropertiesService.getScriptProperties(),
    spreadsheetApp: SpreadsheetApp,
    lockService: LockService,
    utilities: Utilities,
    driveApp: DriveApp,
    cache: CacheService.getScriptCache(),
    logger: console,
    now: nowIso_
  };
}

function parseRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw apiError_("INVALID_REQUEST", "JSON 요청 본문이 필요합니다.");
  }
  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw apiError_("INVALID_JSON", "JSON 요청 본문을 해석할 수 없습니다.");
  }
}

function responseMeta_(requestId, duplicate) {
  return {
    request_id: requestId,
    duplicate: duplicate,
    schema_version: SCHEMA_VERSION,
    server_time: nowIso_()
  };
}

function errorResponse_(error) {
  var known = error && error.apiCode;
  return {
    ok: false,
    error: {
      code: known ? error.apiCode : "INTERNAL_ERROR",
      message: known
        ? error.message
        : "처리 중 오류가 발생했습니다. 관리자에게 문의해주세요."
    },
    meta: {
      schema_version: SCHEMA_VERSION,
      server_time: nowIso_()
    }
  };
}

function apiError_(code, message) {
  var error = new Error(message);
  error.apiCode = code;
  return error;
}

function jsonOutput_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

function nowIso_() {
  return new Date().toISOString();
}

function isAfterDeadline_(now, deadline) {
  var deadlineDate = new Date(deadline);
  if (isNaN(deadlineDate.getTime())) {
    throw apiError_("INVALID_DEADLINE", "수합 회차의 마감 시각이 올바르지 않습니다.");
  }
  return new Date(now).getTime() > deadlineDate.getTime();
}

function requireObject_(value, code, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw apiError_(code, message);
  }
}

function requiredText_(value, code, message) {
  var text = textValue_(value);
  if (!text) {
    throw apiError_(code, message);
  }
  return text;
}

function textValue_(value) {
  return value === null || typeof value === "undefined"
    ? ""
    : String(value).trim();
}

function numberValue_(value) {
  var number = Number(value);
  return isFinite(number) ? number : 0;
}

function columnLetter_(columnNumber) {
  var result = "";
  var value = columnNumber;
  while (value > 0) {
    var remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}
