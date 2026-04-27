package at.oxs.paw.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import at.oxs.paw.model.*
import at.oxs.paw.network.ApiService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class ProfileViewModel(private val apiService: ApiService) : ViewModel() {
    private val _profile = MutableStateFlow<AccountProfile?>(null)
    val profile: StateFlow<AccountProfile?> = _profile

    private val _uiState = MutableStateFlow<UiState>(UiState.Idle)
    val uiState: StateFlow<UiState> = _uiState

    fun loadProfile() {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                val profile = apiService.getProfile()
                _profile.value = profile
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to load profile")
            }
        }
    }

    fun updateProfile(name: String?, geminiToken: String?) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                val request = UpdateProfileRequest(name, geminiToken)
                apiService.updateProfile(request)
                loadProfile()
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to update profile")
            }
        }
    }

    fun requestVerification() {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                apiService.requestVerification()
                loadProfile()
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to request verification")
            }
        }
    }

    fun deleteAccount() {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                apiService.deleteAccount()
                _profile.value = null
                _uiState.value = UiState.Success
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "Failed to delete account")
            }
        }
    }

    fun clearState() {
        _uiState.value = UiState.Idle
    }
}
