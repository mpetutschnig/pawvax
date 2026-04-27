package at.oxs.paw.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import at.oxs.paw.model.*
import at.oxs.paw.network.ApiService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class AdminViewModel(private val apiService: ApiService) : ViewModel() {
    private val _accounts = MutableStateFlow<List<AdminAccount>>(emptyList())
    val accounts: StateFlow<List<AdminAccount>> = _accounts

    private val _animals = MutableStateFlow<List<AdminAnimal>>(emptyList())
    val animals: StateFlow<List<AdminAnimal>> = _animals

    private val _verifications = MutableStateFlow<List<PendingVerification>>(emptyList())
    val verifications: StateFlow<List<PendingVerification>> = _verifications

    private val _stats = MutableStateFlow<AdminStats?>(null)
    val stats: StateFlow<AdminStats?> = _stats

    private val _auditLog = MutableStateFlow<List<AuditLogEntry>>(emptyList())
    val auditLog: StateFlow<List<AuditLogEntry>> = _auditLog

    private val _uiState = MutableStateFlow<UiState>(UiState.Idle)
    val uiState: StateFlow<UiState> = _uiState

    fun loadStats() {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                _stats.value = apiService.getAdminStats()
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to load stats")
            }
        }
    }

    fun loadAccounts() {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                val accounts = apiService.getAdminAccounts()
                _accounts.value = accounts
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to load accounts")
            }
        }
    }

    fun loadAnimals() {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                _animals.value = apiService.getAdminAnimals()
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to load animals")
            }
        }
    }

    fun loadVerifications() {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                _verifications.value = apiService.getPendingVerifications()
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to load verifications")
            }
        }
    }

    fun loadAuditLog() {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                val log = apiService.getAuditLog()
                _auditLog.value = log
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to load audit log")
            }
        }
    }

    fun updateAccountRole(accountId: String, role: String, verified: Int? = null) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                val request = UpdateRoleRequest(role, verified)
                apiService.updateAccountRole(accountId, request)
                loadAccounts()
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to update role")
            }
        }
    }

    fun verifyAccount(accountId: String, approved: Boolean) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                val request = VerifyRequest(if (approved) 1 else 0)
                apiService.verifyAccount(accountId, request)
                loadVerifications()
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to verify account")
            }
        }
    }

    fun clearState() {
        _uiState.value = UiState.Idle
    }
}
